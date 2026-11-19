# Workspace Import / Export

## Portable version-one schema

Settings → Data / Workspace supports private JSON backups and deliberate workspace transfers. Export includes **only** the authenticated user's Subjects, Tasks, Availability and Study Sessions. No profile, onboarding/preferences, email, authentication/session credentials, provider secrets, avatars or Assistant conversations/proposals are exported. Student-entered titles/descriptions remain academic content; review a backup before sharing it.

```json
{
  "format": "ai-study-planner-workspace",
  "version": 1,
  "exported_at": "2026-11-19T12:00:00+00:00",
  "workspace": {
    "subjects": [],
    "tasks": [],
    "availability": [],
    "study_sessions": []
  }
}
```

- Subject: `id`, `name`, `description`, `color`.
- Task: `id`, `subject_id`, `title`, `description`, `deadline`, `estimated_hours`, `remaining_hours`, `progress`, `priority`, `difficulty`, `status`.
- Availability: `id`, `date`, `start_time`, `end_time`.
- Study session: `id`, `task_id`, `date`, `start_time`, `end_time`, `planned_minutes`, `completed_minutes`, `status`, `origin` (`MANUAL` / `SCHEDULER`).

Logical IDs contain 1–64 letters/digits/underscores/hyphens and must be unique within their collection. Export uses deterministic ordinal IDs such as `subjects-0001`; it never exposes database UUIDs or ownership IDs. References resolve exclusively within the file, then through the reviewed Merge mapping. Import assigns fresh UUIDs and server audit timestamps to newly created rows. `created_at`, `updated_at`, `user_id` and unexpected fields are rejected, never restored or trusted. Outcome dates and completed minutes preserve study history independently of audit timestamps.

Version and format are checked strictly; unsupported future versions require an explicit future adapter, not guessing/coercion. Use UTF-8 JSON. Duplicate object keys, non-finite numbers and malformed JSON are rejected. Limits: **2 MiB** file content, **2,000 rows per collection**, **5,000 total rows**, with the same resulting-workspace limits during Merge. Transport is also bounded to accommodate JSON string escaping. Export never truncates; an oversized workspace returns a safe error. Successful imports are checked to remain exportable within the size limits. The UI downloads compact JSON so formatting cannot expand a maximum-size export beyond the import limit.

## API and preview/apply

- `GET /api/workspace/export`: versioned JSON attachment with no-store/nosniff headers.
- `POST /api/workspace/import/preview`: `{mode: "MERGE" | "REPLACE", content: "<raw JSON file text>"}`.
- `POST /api/workspace/import/apply`: the same mode/content plus `evaluated_at`, `fingerprint` and `confirmation` (`"REPLACE"` for Replace, empty for Merge).

All endpoints use existing Bearer authentication and authenticated SQLAlchemy/RLS scope. Preview batch-loads the four owned collections under the workspace read lock and performs **no database writes**, including no stored preview row. It reports additions, existing counts, per-collection duplicates, conflicts, invalid rows and warnings. Any invalid row blocks the whole import; fix the file and preview again. Soft Merge conflicts are explicitly skipped and counted; they do not hide invalid data or overwrite existing rows.

Preview fingerprints use HMAC-SHA256 over the authenticated owner, current planner snapshot, exact raw content, mode, evaluation time, timezone and deterministic proposed insertions. They expire after **10 minutes**. Apply takes the existing per-user transaction lock, reloads/revalidates everything and checks the signature/time before writing. Changed file/mode/account/workspace, an expired preview or restarted signing context requires a fresh preview. Time-sensitive session validation is repeated at Apply. Clients cannot supply replacement row values or database mappings with the token. A repeated Apply after a state-changing import is stale, preventing a second copy.

For local single-process development, a cryptographically random signing key is generated per application instance. Restarting invalidates previews safely. **Multiple workers/replicas must share a stable backend-only `WORKSPACE_IMPORT_SIGNING_KEY` of at least 32 random characters** (secret-managed, never in frontend or Git); rotating it intentionally invalidates outstanding previews. No database migration is needed for this feature.

## Merge policy

Rows are processed in file order; existing matches use stable database-ID ordering. There are no user-supplied database-ID lookups.

1. Subjects match a case-insensitive name. Matching description/color means duplicate reuse. Different details produce a name conflict: keep existing details and map incoming tasks to that existing subject. Duplicate names inside the file similarly resolve to the first subject; preview reports differing details. This does not rename or overwrite an existing course.
2. Tasks match the mapped subject, case-insensitive title and exact deadline instant. Identical normalized task values mean duplicate reuse. Different values mean skip the incoming task and its sessions as visible conflicts. Legitimate tasks with different titles/deadlines are distinct; this is not fuzzy matching.
3. Exact availability intervals are duplicates. Overlaps with live windows are skipped conflicts; conflicting overlaps inside the incoming file are invalid. Intervals are never silently stretched/combined.
4. Exact sessions (including mapped task, time, status, outcome and origin) are duplicates. Overlaps with live sessions are skipped conflicts; overlaps between different incoming sessions are invalid. A session depending on a skipped availability window is a visible conflict if the source file itself had covering capacity. Excess future reservations are skipped conflicts in Merge.

The existing workspace is preserved. Re-importing an unchanged fixture becomes duplicate/no-op work. Renaming/updating existing entities through a backup is not supported; use ordinary validated edit actions or deliberate Replace.

## Replace policy and transaction safety

Replace evaluates against an empty planner and displays the current record count to be removed. The user must explicitly type **REPLACE**, and the server requires that exact confirmation. It deletes only the current owner's sessions, tasks, availability and subjects, in dependency order, then inserts the validated plan within **one transaction**. Any validation/flush/SQL failure rolls back both deletes and inserts. Other users, Auth, Profile, academic preferences, appearance, avatar storage and Assistant metadata are untouched. Existing Assistant pending actions/replan previews retain their normal stale-state protection.

Replace includes historical planner sessions, so export a backup first. An empty version-one document plus Replace is the ordinary, explicitly confirmed way to clear a test workspace; there is no hidden reset endpoint or QA authorization bypass.

Replace preserves distinct logical Subject/Task records one-for-one, including legitimate same-name courses or same-title/deadline tasks. Merge's natural-key matching does not collapse those records during a full restore. Duplicate logical IDs remain invalid; identical duplicate intervals/sessions are still deduplicated because entered intervals must not overlap.

## Domain validation and history

Scalar fields reuse the existing Pydantic entity contracts. Task consistency uses the canonical task service, including reopened IN_PROGRESS tasks at 100%/zero effort. Time windows use the same Budapest/DST helpers and half-open overlap rule as CRUD/planning. Outcomes use shared session validation; planned minutes must equal elapsed interval duration, and completed minutes/status must agree.

Future/ongoing planned sessions require an active task, covering resulting availability, end at/before the deadline and reservations no greater than remaining effort. Malformed future plans are rejected, not repaired or generated during import. Completed/missed/partial outcomes cannot be dated in the future.

Past sessions—including unreported past PLANNED blocks—are archival snapshot records. Past availability may have been removed and a task may since have closed, so historical records do not require current availability/active status. Their clock, overlap and outcome invariants still apply. Restoring historical minutes does **not** decrement task remaining effort or update progress a second time. This is a documented backup-restoration distinction, not a change to ordinary session creation or outcome entry.

An export may contain pending invalid generated work after a task/availability edit. Resolve it through the normal preview/apply replanner before restoring it elsewhere, or correct the file and preview again. Import never changes scheduler ordering, risk thresholds, replanning policy or AI tool behavior.

## Settings, account boundaries and errors

The custom file button selects a local JSON file; Preview sends its raw text only to authenticated FastAPI, never an AI provider. Merge/Replace selection invalidates the earlier preview. The existing Motion, theme and controls are reused. Conflicts and invalid rows are expandable, with accessible text and row numbers; Replace warnings are not color-only.

Raw content, file selection, confirmation and preview exist only in the account-keyed React provider. Sign-out/account switch disposes them and ignores late results, including preventing late export downloads. Neither localStorage nor chat receives the file. Exported files naturally remain wherever the user chose to save them.

After Apply, shared collections/risks refresh and ordinary replan previews are cleared. A successful write followed by failed refresh offers a **loading retry**, never a repeat import. Lost/uncertain Apply responses require refreshing/previewing again; stale signatures prevent duplicate writes. Validation/conflict responses never include raw SQL, secrets or another user's data.

## Deterministic QA workflow

Use a disposable/test account and [qa-workspace-v1.json](fixtures/qa-workspace-v1.json), through the same production Settings/API paths:

1. Export any existing test workspace you want to retain. Choose the fixture, Replace, Preview, inspect counts and type REPLACE. Expected additions: **3 subjects, 4 tasks, 2 availability windows, 2 sessions**. Preview must leave current counts unchanged until Apply.
2. Reload and verify those counts and session/task/subject relationships. The fixture uses fixed dates, not a secret clock override. Its planning week is **7–13 January 2030**, Budapest local time; task deadlines include explicit UTC offsets. Navigate Calendar to that week or use the public planner API with that explicit range.
3. Generate the plan. Five hours of remaining work compete for six availability hours, with one existing scheduler-managed hour. No new allocation should appear for the completed or active zero-effort task. Repeated generation should add no duplicates.
4. Inspect real risks; compare remaining effort/reservations/capacity. Risk wording/urgency depends on actual current time, so fixed fixtures do not freeze time. Normal isolated tests can use the project's existing clock fixtures.
5. To test replanning, remove/edit the fixture's future availability after generation, preview the affected plan, Cancel and verify no writes, then obtain a fresh preview and Apply. Completed historical work remains intact; partial plans are reported when capacity cannot fit everything.
6. Reopen the completed Project Management report. Check IN_PROGRESS/100%/zero remaining effort and the preserved 2020 completed session. Set a real future deadline and explicitly revise effort/progress before expecting allocations or active risk.
7. Export and inspect the versioned file. Merge it back: unchanged records should be duplicates, not new copies. Transfer it to a second disposable account and verify fresh UUIDs, preserved relationships and no access across accounts.
8. Restore the original backup with deliberate Replace or replace with an empty workspace. Clean up only test-account data. Never use a production account as a destructive QA fixture target.

Fixed-date fixtures eventually become archival; update their dates deliberately when needed. They do not promise time-independent risk labels, bypass auth or force scheduler results. JSONB profile data, account settings, avatar files, AI conversation state, audit timestamps and opaque database IDs are outside version one.

Fresh database UUIDs mean exact deadline/priority/effort ties can have different ID tie-break ordering after Replace. The provided fixture deliberately uses distinct deadlines/priorities for its unfinished work. A planner run remains deterministic for the same persisted state; import does not replace the scheduler's identity or ordering policy. Subject edits/deletes now use the existing workspace write lock, matching the other CRUD services so normal concurrent API edits participate in stale-preview protection.

## Verification

The implementation passes **371 backend tests** and **161 frontend tests**, including the existing suites. Frontend lint/build, Alembic metadata check and `git diff --check` pass. Workspace-specific tests use only isolated SQLite/mocked HTTP; they cover ownership, signed previews, no preview writes, transaction rollback, exact-once application via stale-snapshot rejection, duplicate/conflict handling, supported history/reopening states, Unicode/DST/size validation, account disposal, real download helpers and refresh-after-commit safety.

A separate disposable account was checked in the real browser against FastAPI + Supabase. Preview/Cancel left data empty; typed Replace imported the fixture as 3 subjects/4 tasks/2 availability windows/2 sessions; reload preserved those counts and the unchanged Profile. A real JSON attachment downloaded successfully; previewing it in Merge found all 11 records as duplicates. An injected `user_id` field was rejected and could not be applied. Light/Dark at 1440px and 390px had no horizontal overflow or page errors. The disposable Auth account was deleted, and all six owned application tables were checked for zero leftover test rows. No existing user's data was changed.

Source/template/fixture changes were scanned for recognizable secret literals with no findings. No credentials, downloaded user backups or temporary account files are source-controlled. The local signing-key fallback was used in this single-process verification; multi-worker deployments still need the shared environment key documented above.
