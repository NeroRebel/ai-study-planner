# Deterministic scheduler (greedy-v1)

The first scheduler is an explicit, additive backend action. It generates persisted PLANNED StudySessions; it never completes work, changes task effort, moves existing blocks, or calculates risk.

## API and inputs

`POST /api/planner/generate`

```json
{"date_from":"2030-01-07","date_to":"2030-01-13"}
```

Dates are inclusive local dates in APP_TIMEZONE (Europe/Budapest). The interval must contain 1–31 days. Optional task_ids selects 1–100 existing task UUIDs; omission considers all tasks. Unknown selected IDs return 404 before any changes. Empty task_ids, invalid dates, extra fields, and invalid ranges return 422.

The service reads tasks, entered availability within the requested interval, and existing sessions. It captures the server evaluation instant once, after acquiring the same transaction-scoped PostgreSQL advisory lock as CRUD mutations. A client cannot backdate the evaluation time. Calculation receives that instant explicitly for reproducible tests.

## Remaining effort and ordering

Persisted estimated_hours and remaining_hours are canonical; the existing task service already derives progress and converts explicit progress edits into remaining effort. The scheduler normalizes remaining_hours with the existing Decimal-to-minute half-up helper. It does **not** apply the rounded percentage a second time, deduct completed study minutes, or multiply work by difficulty.

Only TODO and IN_PROGRESS tasks with positive remaining minutes are eligible. Completed, cancelled, and zero-work tasks are skipped. Missing/invalid effort, deadline, priority, or difficulty produces INVALID_TASK_DATA and unknown unscheduled effort, rather than an invented estimate. Overdue tasks remain unscheduled with DEADLINE_PASSED.

Tasks are sorted lexicographically by:

1. Deadline's local calendar date, earliest first.
2. Explicit priority HIGH, MEDIUM, LOW.
3. Exact deadline instant, earliest first.
4. Minutes still needing a reservation, smallest first.
5. Difficulty HARD, MEDIUM, EASY.
6. Stable task UUID string.

The same local due date defines **comparable urgency**: a higher-priority task due later that day can precede a lower-priority task due earlier that day. A task due on an earlier date precedes a later-date task regardless of priority. Difficulty only breaks otherwise equivalent suitability ties and never increases effort. This policy is deliberately explicit and versioned; it is a greedy heuristic, not a globally optimal feasibility solver.

## Availability, conflicts, and timezone handling

The engine builds a set of usable local whole-minute intervals from the entered windows. Adjacent windows can combine; duplicated/overlapping source windows cannot double capacity. It removes every existing session interval, regardless of status or task selection, before placing new work.

A usable minute must start at or after evaluation time, lie within entered availability and the requested dates, and end no later than the task deadline. Deadlines with seconds are conservatively floored to the last fitting whole-minute endpoint. An evaluated instant inside a minute advances the first possible start to the next whole minute.

All timezone resolution calls the existing time_rules.local_instant helper. Both minute endpoints must be uniquely resolvable and separated by exactly 60 elapsed seconds. Ambiguous, nonexistent, or discontinuous DST minutes are excluded and reported with DST_TIME_SKIPPED. Contiguous safe runs are never joined across that gap. For a Budapest 01:00–04:00 transition window this conservative policy exposes 119 safe minutes; it intentionally leaves boundary/repeated minutes unused instead of guessing a fold. Other unaffected time on the date remains available.

Existing invalid timing is a 409 requiring correction, never permission to overwrite history. Existing planned durations/deadlines that conflict, or reservations exceeding remaining effort, leave that task untouched with EXISTING_RESERVATION_CONFLICT. CRUD already prevents normal availability edits from uncovering future sessions.

## Study-block rules

- Preferred/maximum generated block: 60 elapsed minutes.
- Preferred minimum useful block: 30 minutes.
- Allocate chronological useful free runs for each task.
- Where a 61–89-minute usable segment would otherwise become 60 plus a tiny tail, rebalance it into two blocks of at least 30 minutes (75 becomes 45 + 30).
- A task's final smaller remainder can be scheduled below 30 minutes.
- Only after considering useful gaps for that task, use otherwise skipped sub-30-minute gaps as a last resort. Positive one-minute fragments are possible when that is the only usable capacity; the engine never generates zero or negative duration.
- Adjacent sessions are allowed. No automatic breaks are invented; frontend-only preferences do not affect the backend policy yet.
- A request creates at most 1000 sessions; further work is returned as unscheduled with GENERATION_LIMIT.

## Existing sessions and repeat generation

No origin/generated flag or database migration is needed for this additive strategy. All existing sessions keep their IDs, timing, statuses, reported minutes, and timestamps.

Subtract the **full duration** of every future or ongoing PLANNED reservation for each task from its remaining effort, even when that reservation lies outside the requested week. Counting the full ongoing block matches existing CRUD capacity rules. Ended sessions are not future reservations; reported time is not treated as proof of task progress.

Generation fills only the resulting deficit. On repeated calls against the same snapshot/evaluation time, occupied time and outstanding reservations prevent duplicate sessions and over-allocation. Newly persisted UUIDs are server-generated; determinism refers to equivalent task/time/minute allocations, not identical new UUIDs or timestamps.

This is not replacement/regeneration: editing a deadline, deleting a block, correcting effort, recording outcomes, or invoking generation at a later time can expose new unscheduled work. Missed sessions are not automatically reconciled or moved. If a changed plan is wanted, manually edit/remove future reservations first.

## Result and persistence

HTTP 200 includes:

- algorithm_version, requested dates, timezone, evaluated_at.
- sessions_created and created_count.
- Counts of fully scheduled, partially scheduled, unscheduled, and skipped tasks.
- Per-task remaining, existing reserved, newly generated, and unscheduled minutes, with outcome/reason codes.
- Total known unscheduled_minutes and warnings. Unknown effort is identified per task and is not silently added as zero to the known total.

Allocation outcomes consider all future reservations, including those outside the requested interval. A task already fully reserved can therefore be FULLY_SCHEDULED with zero new blocks. No tasks, no availability, past intervals, and partial plans are normal 200 results.

The pure calculation does not mutate inputs. The service adds the calculated sessions as one batch, flushes/validates the response, and commits once. Any failure rolls back the batch. The shared advisory lock serializes generation with ordinary writes and concurrent generation requests, protecting validation-before-insert on PostgreSQL. Direct database writers outside these services are not covered by that lock.

## Frontend

The existing expanded Calendar planner offers Generate study plan for its displayed Monday–Sunday week. During generation the action and week controls are disabled. Requests go through api/planner.ts and AppDataProvider/appDataStore, followed by the existing shared data refresh.

The UI reports session counts, partial/unscheduled task counts, remaining minutes, individual reasons, and DST/limit warnings. A partial plan is a saved result, not a transport failure. Network/server failures preserve the current calendar. If generation committed but refresh failed, retrying data loading never reposts generation. Changing weeks hides feedback for the other interval. Short desktop blocks use their true slot height and compact metadata so the old minimum card height cannot visually overlap adjacent generated blocks; full details remain in the session dialog and mobile agenda.

## Verification and limits

Backend tests use the existing isolated SQLite strategy; pure tests pin evaluation instants, including DST dates. Normal pytest never modifies Supabase. Frontend tests mock HTTP, preserve the original suite, and cover action payloads, loading/duplicate protection, success/partial/error feedback, and session refresh.

Live verification must use uniquely identified temporary resources in an otherwise empty future interval. Optional task_ids can isolate API checks. Verify deadlines, elapsed durations, no overlaps, repeat generation, persistence after browser reload, and preservation of baseline data; remove only records created by that check.

Limits: weekly/31-day requests, semester-sized snapshots, conservative DST exclusion, greedy ordering, no automatic breaks, no reservation replacement, no global packing optimization, no risk scoring, no LLM, no authentication, and no automatic missed-session reconciliation. The first scheduler does not solve advanced replanning.
## Implementation verification

The full isolated backend suite passes 102 tests; frontend lint/build pass and all 21 mocked-HTTP tests pass, including the original 14 tests. A live Calendar check against FastAPI + Supabase created four sessions around an unchanged manual block, showed partial-plan feedback, and retained all five blocks after a full browser reload. Repeat UI generation and concurrent API repeat requests created zero new sessions. API assertions checked availability, exact elapsed durations, non-overlap, deadlines, deterministic priority, unchanged task progress, and every pre-existing entity. The temporary records were removed and the complete database snapshot matched the pre-check baseline afterwards.
