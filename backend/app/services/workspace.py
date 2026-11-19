"""Portable, owner-scoped backups with read-only, signed import previews."""
import hashlib
import hmac
import json
from collections import defaultdict
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import delete, select

from app.core.exceptions import DomainError
from app.models import Availability, StudySession, Subject, Task
from app.models.enums import StudySessionStatus, TaskStatus
from app.repositories.intervals import overlap_conditions
from app.schemas.availability import AvailabilityRead
from app.schemas.common import minute_hours
from app.schemas.study_session import StudySessionRead
from app.schemas.subject import SubjectRead
from app.schemas.task import TaskRead
from app.schemas.workspace import (
    MAX_FILE_BYTES, MAX_ROWS, GROUPS, AvailabilityRow, Counts, ImportIssue, ImportPreview,
    ImportResult, SessionRow, SubjectRow, TaskRow, WorkspaceDocument,
)
from app.services.common import now, serialize_read, serialize_write
from app.services.study_sessions import validate_outcome
from app.services.tasks import task_values
from app.services.time_rules import covers, interval

TTL = timedelta(minutes=10)
MODELS = dict(zip(GROUPS, (Subject, Task, Availability, StudySession)))
READERS = dict(zip(GROUPS, (SubjectRead, TaskRead, AvailabilityRead, StudySessionRead)))
ROWS = dict(zip(GROUPS, (SubjectRow, TaskRow, AvailabilityRow, SessionRow)))


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), default=str, ensure_ascii=True).encode()


def strict_json(value):
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                raise ValueError('Duplicate JSON key.')
            result[key] = item
        return result
    def constant(_value):
        raise ValueError('Non-finite number.')
    def valid_text(item):
        if isinstance(item, str):
            if '\0' in item:
                raise ValueError('NUL is not valid PostgreSQL text.')
            item.encode('utf-8')  # Reject unpaired Unicode surrogates before persistence.
        elif isinstance(item, dict):
            for key, child in item.items():
                valid_text(key)
                valid_text(child)
        elif isinstance(item, list):
            for child in item:
                valid_text(child)
    try:
        result = json.loads(value, object_pairs_hook=pairs, parse_constant=constant)
        valid_text(result)
        return result
    except (ValueError, RecursionError, UnicodeError):
        raise DomainError('Use valid UTF-8 JSON without duplicate keys or non-finite numbers.', 400) from None


def document(content):
    if len(content.encode('utf-8')) > MAX_FILE_BYTES:
        raise DomainError('Workspace JSON must be at most 2 MB.', 413)
    try:
        result = WorkspaceDocument.model_validate(strict_json(content))
    except ValidationError:
        raise DomainError('Unsupported workspace format/version or invalid workspace envelope.', 422) from None
    if sum(len(getattr(result.workspace, group)) for group in GROUPS) > 5000:
        raise DomainError('A workspace import may contain at most 5,000 total records.', 413)
    return result


def snapshot(db):
    # Four batch queries; never load an unbounded workspace before applying caps.
    # The extra row detects excess without silently producing a partial backup.
    result = {}
    for group, model in MODELS.items():
        rows = db.scalars(select(model).order_by(model.id).limit(MAX_ROWS + 1)).all()
        if len(rows) > MAX_ROWS:
            raise DomainError('Workspace exceeds the 2,000-record collection limit for import/export.', 413)
        result[group] = [READERS[group].model_validate(item).model_dump(mode='json') for item in rows]
    if sum(map(len, result.values())) > 5000:
        raise DomainError('Workspace exceeds the 5,000-record total limit for import/export.', 413)
    return result


def portable_document(state, exported_at):
    ids = {group: {row['id']: f'{group}-{index + 1:04d}' for index, row in enumerate(state[group])}
           for group in GROUPS}
    workspace = {}
    for group in GROUPS:
        workspace[group] = []
        for item in state[group]:
            row = {key: value for key, value in item.items() if key not in {'created_at', 'updated_at'}}
            row['id'] = ids[group][item['id']]
            if group == 'tasks':
                row['subject_id'] = ids['subjects'][item['subject_id']]
            if group == 'study_sessions':
                row['task_id'] = ids['tasks'][item['task_id']]
            workspace[group].append(row)
    return {'format': 'ai-study-planner-workspace', 'version': 1,
            'exported_at': exported_at.isoformat(), 'workspace': workspace}


def export_workspace(db):
    serialize_read(db)
    result = portable_document(snapshot(db), now())
    # Never silently truncate a backup that cannot subsequently be imported.
    document(encoded(result).decode())
    return result


def normalized_task(row):
    values = row.model_dump(exclude={'id'}, exclude_none=True)
    result = task_values(values)
    if result['remaining_hours'] == 0 and row.status in {TaskStatus.TODO, TaskStatus.IN_PROGRESS}:
        result = task_values(values, Task(**(result | {'status': row.status})))
    if result['status'] != row.status:
        raise DomainError('Task status contradicts its progress/remaining effort.')
    return result


def overlap(left, right):
    return all(overlap_conditions(left['date'], left['start_time'], left['end_time'],
                                  right['date'], right['start_time'], right['end_time']))


def plan_import(state, doc, mode, evaluated_at, timezone):
    additions = {group: [] for group in GROUPS}
    duplicates = Counts()
    conflicts, invalid, warnings = [], [], []
    parsed = {group: {} for group in GROUPS}
    row_numbers = {}

    def issue(collection, group, number, code, message):
        collection.append(ImportIssue(entity=group, row=number, code=code, message=message))

    for group in GROUPS:
        for number, source in enumerate(getattr(doc.workspace, group), 1):
            try:
                row = ROWS[group].model_validate(source)
                if row.id in parsed[group]:
                    raise DomainError('Logical IDs must be unique within each collection.')
                parsed[group][row.id] = row
                row_numbers[group, row.id] = number
            except ValidationError:
                # No raw input, credential-like extra field names or free text in errors.
                issue(invalid, group, number, 'invalid_fields', 'Invalid fields, types or unexpected fields in this row.')
            except DomainError as error:
                issue(invalid, group, number, 'duplicate_id', error.detail)

    subject_refs, task_refs, task_targets = {}, {}, {}
    names, task_keys = {}, {}
    windows, sessions = defaultdict(list), defaultdict(list)
    reserved = defaultdict(int)
    base = state if mode == 'MERGE' else {group: [] for group in GROUPS}
    for row in base['subjects']:
        names.setdefault(row['name'].casefold(), ('existing:' + row['id'], row))
    for item in base['tasks']:
        fields = {key: value for key, value in item.items() if key not in {'created_at', 'updated_at'}}
        row = normalized_task(TaskRow.model_validate(fields))
        row['subject_id'] = 'existing:' + item['subject_id']
        target = 'existing:' + item['id']
        task_targets[target] = row
        task_keys.setdefault((row['subject_id'], row['title'].casefold(), row['deadline']), (target, row))
    for item in base['availability']:
        row = AvailabilityRow.model_validate({key: value for key, value in item.items() if key not in {'created_at', 'updated_at'}}).model_dump(exclude={'id'})
        windows[row['date']].append((row, True))
    for item in base['study_sessions']:
        row = SessionRow.model_validate({key: value for key, value in item.items() if key not in {'created_at', 'updated_at'}}).model_dump(exclude={'id'})
        row['task_id'] = 'existing:' + item['task_id']
        sessions[row['date']].append((row, True))
        if row['status'] == StudySessionStatus.PLANNED:
            _, end, _ = interval(row['date'], row['start_time'], row['end_time'], timezone)
            if end > evaluated_at:
                reserved[row['task_id']] += row['planned_minutes']

    for identity, row in parsed['subjects'].items():
        values = row.model_dump(exclude={'id'})
        # Replace is a faithful snapshot restore: distinct logical records stay
        # distinct even when names/titles match. Natural-key dedup is Merge-only.
        match = names.get(row.name.casefold()) if mode == 'MERGE' else None
        if match:
            subject_refs[identity] = match[0]
            if all(values[key] == match[1][key] for key in ['description', 'color']):
                duplicates.subjects += 1
            else:
                issue(conflicts, 'subjects', row_numbers['subjects', identity], 'subject_name_conflict',
                      'Subject name already exists with different details. Keep existing details and link imported tasks to it.')
        else:
            key = 'new:' + identity
            subject_refs[identity] = key
            names[row.name.casefold()] = (key, values)
            additions['subjects'].append({'key': key, 'values': values})

    for identity, row in parsed['tasks'].items():
        number = row_numbers['tasks', identity]
        if row.subject_id not in subject_refs:
            issue(invalid, 'tasks', number, 'missing_subject', 'Task must reference a valid subject inside this file.')
            continue
        try:
            values = normalized_task(row)
        except (DomainError, ValueError, OverflowError) as error:
            issue(invalid, 'tasks', number, 'task_consistency', error.detail if isinstance(error, DomainError) else 'Task deadline lies outside the supported planner range.')
            continue
        values['subject_id'] = subject_refs[row.subject_id]
        natural = (values['subject_id'], values['title'].casefold(), values['deadline'])
        match = task_keys.get(natural) if mode == 'MERGE' else None
        if match:
            if encoded(values) == encoded(match[1]):
                task_refs[identity] = match[0]
                duplicates.tasks += 1
            else:
                issue(conflicts, 'tasks', number, 'task_conflict', 'A task with this subject, title and deadline has different details. Skip it and its dependent sessions.')
        else:
            key = 'new:' + identity
            task_refs[identity] = key
            task_targets[key] = values
            task_keys[natural] = (key, values)
            additions['tasks'].append({'key': key, 'values': values})

    for identity, row in parsed['availability'].items():
        number = row_numbers['availability', identity]
        values = row.model_dump(exclude={'id'})
        try:
            interval(row.date, row.start_time, row.end_time, timezone)
        except (DomainError, ValueError, OverflowError) as error:
            issue(invalid, 'availability', number, 'invalid_interval', error.detail if isinstance(error, DomainError) else 'Date/time lies outside the supported planner range.')
            continue
        occupied = [entry for entry in windows[row.date] if overlap(entry[0], values)]
        if any(values == other for other, _ in occupied):
            duplicates.availability += 1
        elif occupied:
            collection = conflicts if all(existing for _, existing in occupied) else invalid
            issue(collection, 'availability', number, 'availability_overlap', 'Availability overlaps a different window. No intervals are overwritten or combined.')
        else:
            windows[row.date].append((values, False))
            additions['availability'].append({'key': 'new:' + identity, 'values': values})

    archived = False
    for identity, row in parsed['study_sessions'].items():
        number = row_numbers['study_sessions', identity]
        if row.task_id not in parsed['tasks']:
            issue(invalid, 'study_sessions', number, 'missing_task', 'Session must reference a valid task inside this file.')
            continue
        if row.task_id not in task_refs:
            issue(conflicts, 'study_sessions', number, 'dependent_task_conflict', 'Skip session because its task could not be imported.')
            continue
        values = row.model_dump(exclude={'id'})
        values['task_id'] = task_refs[row.task_id]
        task = task_targets[values['task_id']]
        try:
            _, end, duration = interval(row.date, row.start_time, row.end_time, timezone)
            if duration != row.planned_minutes:
                raise DomainError('Planned minutes must equal actual elapsed interval duration.')
            validate_outcome(row.status, row.completed_minutes, duration)
            if row.status != StudySessionStatus.PLANNED and end > evaluated_at:
                raise DomainError('Study outcomes cannot be imported before their session has ended.')
            if row.status == StudySessionStatus.PLANNED and end > evaluated_at:
                if task['status'] not in {TaskStatus.TODO, TaskStatus.IN_PROGRESS}:
                    raise DomainError('Future planned sessions require an active task.')
                if end > task['deadline']:
                    raise DomainError('Future planned sessions must end on or before the task deadline.')
                if not covers([SimpleNamespace(**other) for other, _ in windows[row.date]], row.start_time, row.end_time):
                    original = [item for item in parsed['availability'].values() if item.date == row.date]
                    if mode == 'MERGE' and covers(original, row.start_time, row.end_time):
                        issue(conflicts, 'study_sessions', number, 'availability_conflict', 'Session depends on an availability window skipped because it conflicts with existing capacity.')
                        continue
                    raise DomainError('Future planned session must fit the resulting availability.')
            else:
                archived = True
        except (DomainError, ValueError, OverflowError) as error:
            issue(invalid, 'study_sessions', number, 'invalid_session', error.detail if isinstance(error, DomainError) else 'Date/time lies outside the supported planner range.')
            continue
        occupied = [entry for entry in sessions[row.date] if overlap(entry[0], values)]
        if any(encoded(values) == encoded(other) for other, _ in occupied):
            duplicates.study_sessions += 1
            continue
        if occupied:
            collection = conflicts if all(existing for _, existing in occupied) else invalid
            issue(collection, 'study_sessions', number, 'session_overlap', 'Session overlaps a different block. Existing sessions are preserved.')
            continue
        if row.status == StudySessionStatus.PLANNED and end > evaluated_at:
            if reserved[values['task_id']] + duration > minute_hours(task['remaining_hours']):
                issue(conflicts if mode == 'MERGE' else invalid, 'study_sessions', number,
                      'excess_reservation', 'Planned reservations exceed this task’s remaining effort. Session is not imported.')
                continue
            reserved[values['task_id']] += duration
        sessions[row.date].append((values, False))
        additions['study_sessions'].append({'key': 'new:' + identity, 'values': values})
    if archived:
        warnings.append('Historical sessions are restored as records. They do not reduce current task effort; past availability need not still exist.')
    if conflicts:
        warnings.append('Conflicting rows are skipped. Review all conflicts before importing; existing records are never overwritten in Merge.')
    if mode == 'REPLACE':
        warnings.append('Replace deletes only your existing Subjects, Tasks, Availability and Study Sessions, including study history. Profile, preferences and authentication stay unchanged.')
    return additions, duplicates, conflicts, invalid, warnings


def fingerprint(owner, state, content, mode, evaluated_at, timezone, plan, key):
    payload = {'owner': str(owner), 'state': state, 'file': hashlib.sha256(content.encode()).hexdigest(),
               'mode': mode, 'evaluated_at': evaluated_at.isoformat(), 'timezone': timezone, 'plan': plan}
    return hmac.new(key, encoded(payload), hashlib.sha256).hexdigest()


def build_preview(db, request, timezone, key, state, evaluated_at):
    doc = document(request.content)
    plan, duplicates, conflicts, invalid, warnings = plan_import(state, doc, request.mode, evaluated_at, timezone)
    resulting = [len(plan[group]) + (len(state[group]) if request.mode == 'MERGE' else 0) for group in GROUPS]
    if any(count > 2000 for count in resulting) or sum(resulting) > 5000:
        raise DomainError('Resulting workspace exceeds the import/export record limits (2,000 per collection; 5,000 total).', 413)
    # A successful import must remain exportable. Predict portable file size
    # without allocating database IDs or persisting anything during preview.
    prospective = {group: list(state[group]) if request.mode == 'MERGE' else [] for group in GROUPS}
    for group in GROUPS:
        for row in plan[group]:
            values = dict(row['values']) | {'id': row['key']}
            for field in ['subject_id', 'task_id']:
                if field in values and values[field].startswith('existing:'):
                    values[field] = values[field][9:]
            prospective[group].append(values)
    document(encoded(portable_document(prospective, evaluated_at)).decode())
    result = ImportPreview(mode=request.mode, evaluated_at=evaluated_at, expires_at=evaluated_at + TTL,
        fingerprint=fingerprint(db.info['user_id'], state, request.content, request.mode, evaluated_at, timezone, plan, key),
        can_apply=not invalid, additions=Counts(**{group: len(plan[group]) for group in GROUPS}),
        existing=Counts(**{group: len(state[group]) for group in GROUPS}), duplicates=duplicates,
        conflicts=conflicts, invalid_rows=invalid, warnings=warnings)
    return result, plan


def preview_import(db, request, timezone, key):
    serialize_read(db)
    return build_preview(db, request, timezone, key, snapshot(db), now())[0]


def insert_plan(db, plan):
    refs = {group: {} for group in GROUPS}
    for group in GROUPS:
        for row in plan[group]:
            values = dict(row['values'])
            parent = 'subjects' if group == 'tasks' else 'tasks' if group == 'study_sessions' else None
            if parent:
                field = 'subject_id' if group == 'tasks' else 'task_id'
                target = values[field]
                from uuid import UUID
                values[field] = UUID(target[9:]) if target.startswith('existing:') else refs[parent][target]
            identity = uuid4()
            db.add(MODELS[group](id=identity, **values))
            refs[group][row['key']] = identity
        db.flush()


def apply_import(db, request, timezone, key):
    current = now()
    if request.mode == 'REPLACE' and request.confirmation != 'REPLACE':
        raise DomainError('Type REPLACE to confirm replacing your planner data.', 422)
    if request.evaluated_at > current or current >= request.evaluated_at + TTL:
        raise DomainError('Import preview expired. Preview the file again.', 409)
    serialize_write(db)
    state = snapshot(db)
    reviewed, plan = build_preview(db, request, timezone, key, state, request.evaluated_at)
    if not hmac.compare_digest(reviewed.fingerprint, request.fingerprint):
        raise DomainError('Workspace, file or preview changed. Preview the import again.', 409)
    fresh, fresh_plan = build_preview(db, request, timezone, key, state, current)
    if not fresh.can_apply or encoded(plan) != encoded(fresh_plan):
        raise DomainError('Import contains invalid rows or time-sensitive conflicts. Preview the file again.', 422)
    try:
        if request.mode == 'REPLACE':
            for group in ['study_sessions', 'tasks', 'availability', 'subjects']:
                model = MODELS[group]
                db.execute(delete(model).where(model.user_id == db.info['user_id']))
        insert_plan(db, plan)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return ImportResult(imported=reviewed.additions, duplicates=reviewed.duplicates, conflicts_skipped=len(reviewed.conflicts))
