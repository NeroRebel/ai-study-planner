# AI Study Planner frontend

React, TypeScript, and Vite. The approved layout and visual tokens are preserved. Core application data now comes from FastAPI and Supabase PostgreSQL through the backend; the browser never connects to PostgreSQL or receives database credentials.

## Run and verify

Start the configured FastAPI backend first (see ../backend/README.md), then from frontend/:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Keep an existing .env instead of overwriting it. The public frontend setting is:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The same address is the local development default if the variable is omitted. Restart Vite after changing environment variables; production builds bake in the configured API address. No production host is hardcoded. This setting is an API URL only: never put DATABASE_URL, DIRECT_URL, database passwords, or service-role keys in frontend/.

Open the frontend using an origin allowed by the backend's CORS_ORIGINS. For example, http://localhost:5173 is the backend development default; http://127.0.0.1:5173 and other ports are separate origins and must be explicitly allowed when used. Backend CORS was not broadened during integration.

```powershell
npm run lint
npm run build
npm test
npm run preview
```

Production hosting needs an index.html fallback for BrowserRouter deep links.

## API and shared state

- api/client.ts centralizes fetch, the configurable base URL, JSON bodies, a 20-second request timeout, no-content responses, and ApiError handling. Components do not call fetch.
- api/subjects.ts, tasks.ts, availability.ts, and studySessions.ts provide list, get, create, update, and delete adapters. Lists follow offset/limit pagination until all records are loaded rather than silently keeping the first 100.
- api/resource.ts provides shared REST transport. Response mappers normalize local time strings from HH:MM:SS to HH:MM and normalize task deadline instants to ISO UTC.
- state/AppDataProvider.tsx and hooks/useAppData.ts replace MockProvider/useMockStore. There is one authoritative collection cache for all pages and editors.
- state/appDataStore.ts loads the four independent collections in parallel, deduplicates simultaneous initialization/refresh requests, and publishes the related collections together. All semester sessions are loaded so week navigation and subject/history views share the same data; server-side windowed loading can be added if the dataset grows.
- Mutations wait for FastAPI validation and then refresh all four collections, including server-side lifecycle effects. UI forms retain entered values on rejection, show the backend message, and prevent duplicate submissions while a write is pending.
- A successful write followed by a failed refresh shows a workspace error with retry. It does not misreport a committed POST as rejected or automatically repeat it.
- Task PATCH requests include only changed writable fields. Unchanged progress is not resubmitted when adjusting an estimate, so the backend can retain canonical remaining effort. IDs, timestamps, remaining hours, and planned duration are not invented by a local reducer.
- Initial load failures do not fall back to sample entities. Loading, error/retry, successful empty, and populated states use the existing card/form styles. Navigation and local Settings remain accessible. Refresh data explicitly reloads external changes.
- DataBoundary provides the loading/error boundary around data-dependent routes. RequestError provides accessible validation feedback. A mutation failure is also visible in the workspace banner.

No Redux, query framework, or other runtime dependencies were added.

## Persistent entities and interactions

Subjects, Tasks, Availability, and Study Sessions are persisted through /api endpoints. Reloading retrieves the saved server records.

- Subjects: overview/details, add/edit, delete. Deletion with linked tasks is rejected by FastAPI.
- Tasks: list, filters, sorting, create/edit/progress, completion, cancellation, and explicit deletion. Deleting a task warns that linked sessions/history are also removed. Domain effort/status normalization and reservation cleanup belong to FastAPI.
- Calendar: current Monday–Sunday week, week navigation, dated availability add/edit/delete, manual study-block add/edit/delete, recorded outcomes, and Generate study plan for the displayed week.
- Session outcomes include reported minutes and input-only task_remaining_hours or explicit confirm_no_progress. These are submitted together to the existing atomic backend outcome service. Time spent is not automatically deducted from task effort.
- Closed-task history remains readable. Historical structural changes and conflicting reservations are rejected by the backend, with an explanation rather than automatic replanning.

No independent mock mutation implementation remains active.

## Reporting and dates

The reporting date is the actual current Europe/Budapest date, with a Monday-start week, rather than the former fixed October demo week. The provider checks for a changed local date every minute. Dashboard, Progress, and Calendar use consistent reporting periods.

Deadlines are backend UTC instants. Forms convert them explicitly to/from Budapest wall time with utils/dates.ts; ambiguous and nonexistent DST inputs are rejected. Session and availability dates remain date strings and their times remain local HH:MM strings, without conversion through device UTC. The backend APP_TIMEZONE must remain Europe/Budapest for this single-workspace phase.

Dashboard counts, subject/overall effort progress, task deadlines, reported study time, availability, and entered sessions are presentation summaries of persisted entities. No ranking engine, feasibility engine, or deadline-risk algorithm runs in the browser. The focus list is simply active work displayed by deadline; summary read endpoints can replace frontend aggregation in a later backend phase.

## Remaining prototype features

- Risk is live derived backend data from `GET /api/risks`, not a fixture. One batch powers subjects, task details, Deadlines and Dashboard. Loading/errors are independent of core entities; failed/expired assessments display unavailable with retry. No-active-work results have no risk label.
- data/prototypeHistoricalAnalytics.ts contains the fixed earlier completion-history points. The chart labels them as historical fixtures; its Current point uses saved task data.
- services/mockAssistant.ts remains scripted. Replies and action targets read the loaded subjects, tasks, sessions, and deadlines using persisted IDs. Chat text never mutates entities. Suggested actions open the ordinary API-validated editors. Relative Friday references use the current Budapest date.
- Account profiles are persistent. Study/appearance preferences and scripted chat history remain session-local and reset on reload. Appearance controls do not implement a dark theme. Planning preferences do not generate or move sessions.

Automatic study-session generation is implemented as an explicit backend action. Unattended automatic replanning, LLM, notifications, external calendar integration, and PDF import remain unimplemented.

## Tests and persistence verification

npm test uses Node's built-in test runner, the existing TypeScript compiler, and mocked HTTP. It never requires FastAPI or Supabase. Tests cover response mapping, initialization and deduplication, pagination, successful mutations and fresh-store loading, server-owned progress and lifecycle effects, rejected writes and visible validation feedback, network recovery, a committed write with failed refresh, loading/error/empty states, timezone/DST serialization, summaries, and scripted responses using persisted IDs.

Live verification for this integration used the running FastAPI service with its configured Supabase database:

1. Created a uniquely named subject through the UI; reloaded and confirmed it remained.
2. Created a task, changed progress to 25%, reloaded, and confirmed 25% progress and 1.5 remaining hours.
3. Added dated availability and a manual study session; reloaded Calendar and confirmed both remained.
4. Observed clear availability-overlap rejection in the form.
5. Read the same records through a fresh API-backed store and verified the configured localhost:5173 CORS origin.
6. Removed only the five exact temporary verification records after checking their server-generated IDs, timestamps, and relationships. Existing demo records were retained.

These historical integration checks predate authentication. Current Auth/provider live checks and ownership migration verification are documented in docs/authentication.md.

## Limits

There is no offline write queue, optimistic persistence, automatic retry of writes, realtime synchronization, or concurrent-edit versioning. If a network interruption makes a write's outcome uncertain, refresh before retrying. Collection refresh is explicit; local state is not a separate persistence layer. All current session history is loaded for a small semester dataset.

Supabase Auth, persistent profiles and backend per-user ownership are implemented. Study preferences and historical analytics fixtures remain prototypes; drag-and-drop is not implemented.

## Generate study plan

The expanded weekly planner calls POST /api/planner/generate through api/planner.ts and the shared data store. The selected week determines the inclusive date range. The button and week controls are disabled while generating; all persisted collections refresh after success so generated blocks appear immediately. Partial results show the number of tasks that could not fit, unscheduled minutes, and reasons without treating a saved partial plan as an API failure. Errors retain the current calendar. A committed result is retained if refresh fails; Retry loading never reposts generation.

Existing manual/generated/history blocks are preserved and count against capacity and remaining reservations. Pressing Generate again fills only missing work. There is no frontend scheduling algorithm, destructive regeneration, or new dependency. See [scheduler documentation](../docs/scheduler.md) for the exact backend policy.

## Deadline risk

The provider refreshes the read-only risk batch after loading/mutations and at its expiry. Obsolete responses are discarded when inputs change. Risk does not alter task/session persistence. See [the policy](../docs/risk-engine.md) for exact thresholds and shared capacity limitations. No LLM is involved; the existing assistant remains scripted.

## Explicit replanning

Calendar has a Replan button for the displayed week. It requests a read-only preview and shows session moves/additions/removals, affected task risk changes and unscheduled work. Apply changes sends the snapshot/diff version, then refreshes shared entities and risks. Cancel saves nothing. Stale conflicts require a fresh preview; duplicate submissions are disabled. A committed apply followed by refresh failure is not automatically repeated. Existing session editors show planner origin and explain that changing placement makes the block manual. Backend migration `0002_session_origin` must be applied. See [replanning policy](../docs/replanning.md); there is no automatic background replanning or LLM.


## Authentication and profiles

Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in ignored .env.local, alongside VITE_API_BASE_URL. Use only the public publishable/legacy anon key; Vite refuses backend-secret/service-role configuration. Restart the dev server. Supabase JS handles Auth and private avatars only; core entities still use FastAPI.

AuthProvider restores identity before protected routes mount. Sign In/Sign Up/Check Email/Forgot Password/Reset Password and /auth/callback implement the email/PKCE and optional Google flows. The centralized API client adds the current bearer token and handles 401 without retries. Planner providers are keyed per identity; unmount clears cached entities, risks and replanning previews and suppresses late responses. Profile requests also reject obsolete account responses.

Settings Account edits the persistent profile, displays Auth email/fixed Budapest timezone, manages private signed-URL avatars and provides sign-out/typed-confirmation account deletion. Other study/appearance preferences remain local. Backend migration 0003 and private avatars bucket policies are required. See [docs/authentication.md](../docs/authentication.md) for exact Supabase/Google/Storage setup, recovery limitations and live two-user acceptance steps. Those provider flows are unit-tested with mocks but were not live-verified without operator-supplied Auth configuration.
