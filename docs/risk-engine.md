# Deterministic deadline risk engine

`capacity-v1` is a read-only assessment, not a completion probability. It creates no sessions, changes no tasks and triggers no planning. No database migration or stored risk field is needed.

## Inputs and API

`GET /api/risks` returns all task assessments, subject summaries, policy version, timezone, evaluation/expiry instants and capacity warnings in one response (`Cache-Control: no-store`). Four collection SELECTs avoid N+1 queries. A shared PostgreSQL advisory transaction lock coordinates the read snapshot with existing CRUD/scheduler writes. `assess_task` can select one result while preserving competing demand context.

Inputs are persisted tasks, subjects, availability and sessions, plus a timezone-aware evaluation instant. `remaining_hours` is canonical: convert it to whole minutes using the same half-up normalization as the scheduler. Do not multiply it by progress again. Completed/cancelled tasks and tasks with zero remaining work have null level and `not_applicable` status. Invalid task data produces `unavailable`, never a fabricated LOW.

## Capacity accounting

1. Reuse the scheduler's shared minute grid and `time_rules` utilities. Inspect entered availability from now through the latest active deadline, including dates outside the displayed week. Ignore past time and truncate each task's capacity at its exact deadline.
2. Remove every occupied session minute from free availability, regardless of status or manual/generated origin. Overlapping availability is unioned, so no minute appears twice.
3. Count a task's useful PLANNED minutes only when the valid session ends by its deadline, has no reported completion, is inside entered availability, and is not in conflict with another reservation. For an ongoing session only future whole minutes count. Cap scheduled coverage at remaining effort. Completed/missed/partial historical work is not added again: recorded task remaining effort already represents outstanding work.
4. Allocate free-minute claims to deficits in the scheduler's exact order: Budapest local deadline date, priority HIGH/MEDIUM/LOW, exact deadline instant, unreserved effort ascending, difficulty HARD/MEDIUM/EASY, task ID. Every claimed minute is removed before the next task. This is capacity accounting only; it does not call session generation or persist a plan.
5. After all claims, leftover free minutes before each deadline are shared contingency. `free_available_minutes = allocated_free_minutes + shared_slack_minutes`; `capacity_minutes = scheduled_minutes + free_available_minutes`. Required claims are disjoint. Shared contingency is explicitly reusable margin, so task capacity figures must **not be summed**. Reservations of unrelated tasks are never free time.

## Exact policy

Evaluate rules in this order for active positive remaining work:

| Level | Rule |
| --- | --- |
| HIGH | Deadline is at or before now, or capacity is less than remaining minutes. |
| MEDIUM | Capacity is sufficient, but any condition below holds. |
| LOW | Capacity is sufficient and none of the MEDIUM conditions hold. |

MEDIUM conditions:

- Margin is less than `max(90 minutes, ceil(remaining_minutes / 4))`.
- Deadline is within 48 hours, inclusive.
- Deadline is within 7 × 24 hours, inclusive, less than half the work is scheduled, and capacity is less than twice remaining work.

Priority influences competing capacity allocation rather than artificially changing a label. Equality at the required capacity is feasible but MEDIUM due to zero margin. Overdue incomplete work is HIGH even if old availability existed.

Every assessed task includes deterministic English explanation and machine reasons: `deadline_passed`, `insufficient_capacity`, `sufficient_capacity`, `narrow_margin`, `deadline_soon`, `low_schedule_coverage`, `healthy_margin`. Inactive/invalid results have explanatory reasons too. Explanations include required/capacity hours and the relevant constraint. Dates use the configured timezone.

## Subject aggregation

Highest active task level wins: HIGH, then MEDIUM, then LOW. No active deadline-based work means null level / `not_applicable`. Unavailable tasks prevent a misleading LOW summary; a known HIGH or MEDIUM still takes precedence, with unavailable count exposed.

## Frontend freshness and failures

The shared provider fetches one batch after core loading and after successful mutations/generation. Risk loading/errors do not prevent use of core entities. Mutations mark old assessments stale and discard obsolete in-flight responses. The provider refreshes on the returned expiry (next minute, urgency/deadline boundary, or at most 60 seconds). Expired/failed assessments show unavailable, with retry; inactive work shows no active risk. No fixture risk labels remain.

## Timezone and DST

Reuse configured `APP_TIMEZONE` (`Europe/Budapest`), timezone-aware deadline instants and date-only local availability/session values. No alternative browser timezone conversion is introduced. Only uniquely resolvable local minute boundaries exactly 60 real seconds apart are counted. Ambiguous/nonexistent/discontinuous DST minutes are excluded with warnings, consistently with scheduler generation. Elapsed partial minutes are excluded conservatively.

## Limitations

Capacity represents entered study time, not concentration, future disruptions or a guarantee of completion. Difficulty affects the established allocation tie-break only. Unscheduled capacity need not form a useful contiguous block; risk is minute-based, while session generation applies block rules. Shared margin is not an additive resource. Assessment loads the small demo workspace in memory; larger datasets will need windowed queries. No snapshots, risk history, authentication, automatic replanning, notifications or LLM are implemented. Unknown occupancy is treated conservatively. The scheduler still reserves an entire ongoing planned block to prevent duplicate booking; risk reports only its useful future portion.

## Verification

Isolated backend tests cover thresholds, competing tasks, exact deadlines, overlaps, scheduled/free accounting, progress semantics, all subject states, fixed-instant determinism, read-only database behavior, constant query count and Budapest DST. Frontend HTTP-mocked tests cover batch mapping/loading/retry, stale-response rejection, badges, subject cards/detail lists, Deadlines and Dashboard. Normal unit tests never use Supabase.
