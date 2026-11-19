# Post-registration onboarding

## Flow and gate

Supabase sign-up/confirmation/sign-in is unchanged. After authentication, `OnboardingGate` waits for an owned profile with a known `onboarding_completed` boolean. It never mounts the planner or its data provider while profile status is unknown. Missing/failed profiles show loading or Retry. Account mismatch also stays gated. New users go to `/onboarding`; completed users enter the workspace. Recovery keeps the existing password-reset route.

Five steps:
1. About you: optional university, program, level and year.
2. Subjects/skills: selectable chips, optional custom names, no planner records yet.
3. Study rhythm: weekly target, session duration, preferred period and selected weekdays. Weekends use the same day selection model.
4. Goals: optional multiple academic/study goals.
5. Start: manual or AI-assisted, plus explicit subject-creation consent.

Continue saves that step and the next resume step to the authenticated profile. Reload resumes the last saved step. Back preserves the current in-memory draft; unsaved edits can be lost on reload. Data is not stored in a browser onboarding cookie or shared local draft. Skip completes onboarding, records `onboarding_skipped=true`, keeps already saved optional details and creates no planner entities. Relevant details remain editable later, so users are not forced through setup repeatedly.

## Model, validation and ownership

`profiles` adds optional university/study_program (160 chars), study_level (Bachelor/Master/PhD/Other), study_year (1–12), weekly_study_hours (1–80), preferred_session_minutes (30/45/60/90), preferred_study_period (Morning/Afternoon/Evening/Flexible), plus preferred_study_days, interests, goals and onboarding lifecycle fields.

Interests are bounded arrays of `{name,type}` with type subject/skill and 1–80 character names. Names are unique case-insensitively. Goals use an allowlist of seven study goals; days are unique ISO weekday integers 1–7. Arrays are JSONB in PostgreSQL and JSON in isolated SQLite tests. This avoids three join tables for small preference lists. Tradeoff: JSON elements cannot be joined/indexed like normalized rows, and structural/duplicate validation belongs to the API. Database checks enforce scalar ranges/enums. If preference analytics or a shared catalog is introduced, normalize these arrays then.

All fields live in the existing user-owned Profile row. Existing forced RLS and `auth.uid() = user_id` policies apply to every column. Authenticated request sessions derive ownership from the verified JWT; no API request accepts user_id. The profile contains no credentials or duplicated auth email/password.

`onboarding_completed`, `onboarding_completed_at`, `onboarding_skipped` and start mode are server-managed by the completion action, not writable through generic PATCH. `onboarding_step` is only a draft resume hint.

## Migration

Alembic `0005_profile_onboarding` is additive. It temporarily adds completion with a TRUE server default to backfill existing profiles, timestamps that migration completion, then switches the default to FALSE for future profiles. Existing users keep access; new profiles start incomplete. No legacy records are assigned or deleted. Existing RLS policies and Auth foreign keys remain intact. Run `alembic upgrade head`, then `alembic check` before deploying the new frontend. A downgrade removes the newly added preference fields; export them before intentionally downgrading.

## API and completion consent

- `GET /api/profile`: bootstrap/read the authenticated profile, including onboarding status.
- `PATCH /api/profile`: save validated academic details, preference lists and draft step.
- `POST /api/profile/onboarding/complete`: `{start_mode: manual|ai, create_subjects: boolean, subject_names: string[], skip: boolean}`.

The completion action uses the personal-workspace transaction lock and a profile row lock. If requested, it creates only approved subject-type interests through the Subject service insertion primitive. Skills never become planner courses. Exact approved names must match the current saved subject selection; concurrent selection changes return a clear 409 requiring review. Existing matching subject names are kept. Subject insertion and completion commit together, with rollback on failure. Repeated completion returns the saved profile and creates nothing further. No tasks, availability, sessions, progress or risks are invented or changed by onboarding.

## Manual and AI starts

Manual start opens Dashboard with first actions for subjects/tasks/availability/planning. Generate study plan links to the existing Calendar action; it does not run a planner without explicit user action and real inputs.

AI-assisted start opens `/assistant?setup=1` with a setup introduction and Start guided setup. That button sends a normal authenticated Assistant message. The existing tool loop reads real subjects, tasks, profile context and availability, then asks for missing assignment titles, exact deadlines, effort and dated study windows. Every write retains the existing server-owned confirmation flow. After records are saved, the Assistant can propose deterministic Scheduler generation for a specified horizon, show the returned result, and offer existing replan previews where appropriate. Preferences are not booked availability; no complete schedule is generated from interests alone. If no subject was created, the UI links to Subjects first; the current Assistant does not gain an arbitrary subject-creation tool.

## Profile and Settings

Profile edits identity, university, program, level/year and the fixed Europe/Budapest timezone. Settings Planner edits account-persisted weekly target, session duration, period, days and goals. The account session preference initializes new manual blocks; previously saved blocks and automatic Scheduler policy are untouched. Device-local manual-duration preference remains only as a fallback for older/unspecified accounts. Other appearance/layout preferences remain local as documented in UI notes.

## AI context and guardrails

The authenticated `get_profile_context` tool and initial safe context include study program, subjects/skills of interest, goals, weekly target, preferred session duration/period/days. Lists and strings are bounded. University, email, profile user ID, timestamps, avatars, credentials and unrelated user records are excluded. This selected context may be sent to the configured external AI provider. Free-text academic fields are untrusted student data, never prompt instructions.

The system prompt confines the Assistant to studying/learning, courses, tasks, deadlines, planning, availability, progress, risks, replanning, academic goals and relevant study habits. Clearly unrelated requests get a polite scope redirect. Tools remain allowlisted; no web search, image generation, general coding execution or external-action tools are added. Scheduler/Risk/Replanner remain authoritative, with unchanged algorithms and thresholds. Preference goals never override feasibility or risk.

## Session and account boundaries

The existing Supabase session restoration, bearer token client and FastAPI JWT validation remain. The onboarding gate sits inside AuthGate. Profile requests and completion responses reject obsolete account revisions. The wizard is keyed by authenticated profile ID and unmounts when ownership changes; late local responses cannot navigate or publish another account's draft. Sign-out uses the existing action. Onboarding metadata persists across sessions/devices because it is server data, while credentials remain in the existing Auth system.

## Validation and known limits

Normal pytest uses only isolated SQLite, including a real migration test that backfills an old row and verifies a new row's FALSE default. Tests cover validation, ownership, exact subject consent, transactional rollback, skip/idempotency, and safe user-specific AI context. Frontend tests mock HTTP and cover gating, steps, chips, validation, draft payloads, completion, failures and late account responses. Browser review uses the actual themed wizard at 1440/1024/768/390px.

This is not a university catalog or an automated syllabus importer. The weekly target is recommendation context, not hard capacity. Preferred days/period do not create recurring availability or change planner behavior. Profile timezone remains Europe/Budapest. Current preferences have no concurrent-edit version token; subject creation alone includes exact-name stale-consent protection. Email delivery requires operator SMTP/Supabase configuration; verification can use generated confirmation tokens without sending mail. Completing onboarding does not automatically call or bill an AI provider.

## Verification for this implementation

- Full isolated backend suite: **284 passed** (31 onboarding tests).
- Frontend: **138 passed** (17 onboarding tests); lint and production build passed.
- Live Supabase migration 0005 applied; `alembic check` reports no schema drift.
- Two disposable accounts completed real Auth confirmation-token verification and browser sign-in. SMTP email delivery was intentionally not exercised.
- Browser checks verified five steps, keyboard chip selection, invalid-year validation, Back/Continue, saved-step reload, explicit subject approval, manual completion, academic Profile editing, persisted Settings preferences, account switching, guessed-resource 404, and AI-assisted entry without fabricated entities.
- Forty real wizard captures covered Light/Dark at 1440, 1024, 768 and 390px with no horizontal overflow. Twelve additional read-only component previews covered High Contrast, teal accent and Reduced Motion at desktop/mobile sizes.
- Live Gemini summarized the persisted program, 20-hour target and 45-minute session preference and redirected an unrelated request; Profile and planner entity snapshots remained unchanged. An initial provider timeout returned a safe error before a successful retry.
- Disposable users and their owned rows were deleted after verification. Normal tests never call live Supabase/Gemini.

The new guided-entry path was verified, but a complete conversational creation of tasks/availability followed by Scheduler confirmation was not repeated in this onboarding check; it continues to use the existing separately tested Assistant tool/confirmation flows. No scheduling or risk policy was changed.
