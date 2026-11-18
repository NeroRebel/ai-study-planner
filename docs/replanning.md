# Deterministic affected-plan replanning

`affected-v1` is an explicit preview/apply workflow. It reuses `scheduler.calculate_plan()` for allocation and `risk_engine.calculate_risks()` for both risk snapshots. Neither preview nor applying a plan changes task progress, availability or deadlines.

## Session origin and preservation

Migration `0002_session_origin` adds a constrained `origin` string: `MANUAL` or `SCHEDULER`. All legacy rows become MANUAL; origin cannot safely be inferred from titles or timing. New manual CRUD blocks default to MANUAL. Scheduler/replanner creations use SCHEDULER. Origin is response metadata, not a user-writable request field. Explicitly changing a generated block's task/date/time transfers it to MANUAL, protecting the student's placement. Outcome-only changes retain origin.

Editable sessions must be SCHEDULER + PLANNED, have zero completed minutes, start at or after the evaluation instant, and lie in the requested date range. All outcome-recorded, past, ongoing, manual and out-of-horizon sessions remain fixed. Untouched rows retain IDs and timestamps. Moves/trims retain their old session IDs. No historical outcome is moved or deducted again.

The existing session workflow records MISSED (skipped), PARTIALLY_COMPLETED and COMPLETED. Reported minutes and work progress are distinct: outcome entry supplies canonical remaining effort or confirms no work progress. Replanning reads persisted `remaining_hours` with the existing half-up minute conversion; it never subtracts completed minutes again or assumes that scheduled time means completed work. Past PLANNED sessions are preserved as unreported history, do not count as future reservations, and still need an explicit outcome.

## Triggers and ordinary CRUD

Explicit repair can follow missed/partial/completed outcomes, task creation, changes to task priority/deadline/progress/effort/status, availability changes, and raised risk. Priority or a later deadline alone does not move valid work without a demonstrable deficit. Risk does not automatically trigger writes.

Task/availability guards still reject changes invalidating manual or ongoing reservations. Future generated reservations may temporarily become invalid after an edit; they remain present for the user to review through Replan rather than being silently moved/deleted. Task closure retains future generated rows for approved cleanup. Existing explicit CRUD lifecycle behavior for manual reservations and explicit cascading task deletion remains separate from replanning; this engine never deletes manual sessions or task history. An ongoing task session must receive its outcome before closing the task.

## Affected-plan algorithm

1. Batch-load tasks, subjects, all availability and all sessions. Select the explicit repair horizon (1–31 inclusive days). Optional task IDs identify root demand; default is all tasks. Reservations outside this range still count against remaining effort.
2. Keep immutable sessions. Examine editable blocks in existing scheduler order, then chronological order. For selected tasks, release blocks that no longer fit availability/deadline, conflict, exceed remaining effort, or belong to closed tasks. Preserve earliest valid reservations within each task's budget; excess tails can be trimmed by allocation/diffing. Unselected blocks initially remain fixed.
3. Call the existing scheduler for root/affected demand, using preserved sessions as reservations. This fills deficits in free time first. It does not rebuild valid unrelated blocks or reorder a fully covered plan.
4. If deficits remain, trial one lower-ranked editable reservation at a time. Use the scheduler's local due-date, priority, exact deadline, unreserved effort, difficulty and task-ID ordering. Try worst-ranked/latest reservations first. A candidate must start before a higher-ranked deficit's deadline. Accept a trial only if that strictly higher-ranked task's shortfall decreases and no already-considered higher-ranked task's shortfall increases. Include the displaced task as dependent demand and allocate again. Manual/history/ongoing/out-of-range blocks cannot be trial candidates. Stop when no improving displacement remains; limit trials to 1,000 and expose any remaining shortfall.
5. Compare released reservations with proposals: keep exact matches, pair replacements within the same task chronologically as moves/trims, report unmatched old rows as removed and unmatched new rows as created. Deterministic UUIDv5 identifiers make proposed new slot identities stable for the same snapshot. Never pair a move across tasks.
6. Validate positive durations, local-time resolution, availability, deadline and overlap rules for changed/new blocks. Preserved invalid manual/out-of-range reservations generate review warnings rather than being erased. Scheduler accounting protects against over-reservation.
7. Evaluate complete-workspace risk before/after with the unchanged engine at the same explicit instant. Return the exact diff, affected tasks, allocation summaries, warnings/reasons and unscheduled minutes. Risk improvement is not guaranteed; partial plans are successful previews, not hidden failures.

## API and concurrency

- `POST /api/planner/replan/preview`: `{date_from, date_to, task_ids?}`. Returns `ReplanPreview`; no inserts, updates, deletes or commit.
- `POST /api/planner/replan/apply`: same request plus preview's `evaluated_at`, `fingerprint`, and `plan_digest`. It does not accept arbitrary session changes from the browser.

The fingerprint covers all four entity collections (including timestamps), scope, configured timezone and policy version. Even unrelated writes conservatively invalidate a preview. Preview acquires the same shared PostgreSQL transaction advisory lock as risk reads. Apply acquires the existing exclusive workspace write lock, reloads everything and recomputes the proposal at the original instant. Both fingerprint and complete preview digest must match. Preview expires after five minutes; crossing the start of any changed/proposed session also returns 409. Apply validates before touching rows, persists only the diff in one transaction and rolls back any failure. Client receives a clear request-new-preview conflict.

No server-side preview table, persistent risk field or receipt store is needed. A repeated changed-plan Apply returns 409 because the snapshot changed, preventing duplicates. A fresh subsequent preview is a no-op when requirements are covered; a no-op Apply performs no DML or unnecessary timestamp updates. An HTTP timeout may have an unknown commit outcome: request a fresh preview, rather than resubmitting the old apply blindly.

## Frontend

Calendar's Replan action uses the displayed week. A compact existing-style modal shows kept/moved/added/removed blocks, old/new local times, affected task risk before/after, and per-task unscheduled work. Cancel does not call Apply. Loading and shared pending guards prevent duplicate submissions. Mutations/refresh invalidate an open preview. Success reloads shared entities and risk; a failed refresh after committed Apply does not invite a second apply. Conflict/error discards the unsafe preview and offers a fresh preview. No new dependency or redesign is required.

## Time and limitations

Reuse `APP_TIMEZONE` (Budapest), `time_rules.interval/covers`, the repository's shared half-open overlap predicate, shared task ordering and the scheduler's safe minute grid. Ambiguous/nonexistent DST minutes remain excluded consistently. A preview is deterministic for the same snapshot, request and evaluation instant; wall-clock metadata can differ across requests.

This is greedy local repair, not global optimization. Only one requested range of at most 31 days can be edited; the UI requests one week. Out-of-range invalid generated work is preserved and warned about: select its week or request a wider API range. Missing history/progress is not guessed. Conservative minute/block rules and immutable reservations may leave work unscheduled. Existing risk capacity is minute-based and shared contingency is not additive. The personal-workspace advisory lock and in-memory snapshots target a semester-sized dataset; larger/multi-user deployments need scoped locking/querying. No realtime automatic mutation, AI/LLM, notifications or authentication is added.

## Verification

Normal pytest uses isolated SQLite, never Supabase. Tests cover no-op/DML absence, all preservation categories, outcomes, deadline/priority/availability changes, conflicting work, partial results, unchanged risk thresholds, read-only preview, exact Apply, stale/time-boundary rejection, repeat safety, Budapest/DST, and rollback after flushed writes. Frontend tests mock HTTP and cover the action/modal, loading, diff/risk/warnings, Cancel/Apply, double-submit prevention, stale/network failures and entity/risk refresh. Live development checks use journaled disposable records and verify original records are restored after cleanup.
