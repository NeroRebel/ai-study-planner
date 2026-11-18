# AI Study Planner backend

FastAPI remains the application backend. Supabase hosts PostgreSQL; React never receives database credentials or talks directly to Supabase. The API implements resource CRUD, lifecycle validation, and explicit deterministic study-session generation. The approved frontend uses its shared API-backed AppDataProvider.

## Architecture and files

```text
backend/
├── app/
│   ├── api/
│   │   ├── dependencies.py
│   │   ├── router.py
│   │   └── routes/          # health, subjects, tasks, availability, study_sessions
│   ├── core/               # environment settings and sanitized errors
│   ├── db/                 # declarative base, engine, session dependency
│   ├── models/             # SQLAlchemy entities and uppercase enums
│   ├── schemas/            # Pydantic v2 create/patch/read contracts
│   ├── repositories/       # database reads and filters
│   ├── services/           # validation, lifecycle rules, transactions
│   ├── seed.py             # explicit development seed CLI
│   └── main.py             # create_app factory and ASGI app
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/0001_core_initial_core_tables.py
├── tests/                  # isolated SQLite API/service tests
├── alembic.ini
├── pyproject.toml
├── requirements.txt
└── .env.example
```

Request flow: React → FastAPI route → business service → SQLAlchemy → Supabase PostgreSQL. Routes validate input and delegate mutations to services. Repositories contain simple queries. Each application instance owns one pooled engine; request sessions are dependency-injected and closed after use, rolling back uncommitted work on errors. Startup does not create tables, migrate, or seed.

Supabase Auth and per-user ownership are implemented; no AI, Realtime or Edge Functions are used. The backend uses HTTP Auth/Admin APIs, not the Supabase Python SDK. Each verified identity has an isolated workspace and profile. Legacy NULL-owner rows are quarantined.

## Environment and dependencies

Use Python 3.12 or newer. From the repository root in PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Copy the example only when creating a new local environment; keep an existing configured .env. If activation is unavailable, use `.venv\Scripts\python.exe` in place of `python`, and `python -m alembic`, `python -m uvicorn`, or `python -m pytest` for the corresponding commands.

Dependencies are pinned to the versions used for verification. They include FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, pydantic-settings, psycopg 3 with binary distribution, uvicorn, tzdata (including Windows timezone support), pytest, and httpx for API tests. Starlette is pinned for compatibility with the httpx TestClient; one third-party AnyIO deprecated-alias warning is narrowly excluded from the otherwise warnings-as-errors test configuration.

## Supabase setup

1. Create a Supabase project.
2. Open its Connect panel and obtain its PostgreSQL connection information.
3. Enter DATABASE_URL for runtime access and DIRECT_URL for migrations in **backend/.env**, using the actual database password. URL-encode reserved characters in credentials.
4. Keep .env private. Root .gitignore excludes .env and .env.* while retaining .env.example.
5. Run migrations explicitly before using CRUD endpoints.

The example contains placeholder credentials only. Replace PROJECT_REF, PASSWORD, and the host/region with your own connection details:

```dotenv
DATABASE_URL=postgresql+psycopg://postgres.PROJECT_REF:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql+psycopg://postgres.PROJECT_REF:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
CORS_ORIGINS=http://localhost:5173
APP_TIMEZONE=Europe/Budapest
DB_POOL_SIZE=3
DB_MAX_OVERFLOW=2
DB_POOL_TIMEOUT=15
DB_POOL_RECYCLE=1800
```

Accepted schemes are `postgresql://`, `postgres://`, and `postgresql+psycopg://`; the backend normalizes them to psycopg 3. A standard PostgreSQL SQLAlchemy URL works without a project-specific hostname in source code.

FastAPI runtime access (and the manual seed command) always uses DATABASE_URL. For this pooler setup, use the transaction pooler on port 6543. Alembic uses DIRECT_URL when set, for both online migrations and offline SQL generation; use the session pooler on port 5432 or a reachable direct database connection. If DIRECT_URL is omitted or empty, Alembic falls back to DATABASE_URL. Prefer configuring DIRECT_URL so schema migrations avoid the transaction pooler. The variable name DIRECT_URL also supports a session-pooler URL; it does not require a direct database hostname. Follow the project's connection/network restrictions. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

Use TLS for remote connections: include `sslmode=require`, or `sslmode=verify-full` with the appropriate root certificate for certificate and hostname verification. psycopg server-side prepared statements are disabled (`prepare_threshold=None`) to accommodate transaction-pooler restrictions, and the optional pgbouncer=true URL flag is removed before passing connection arguments to psycopg/libpq, which does not recognize that flag. Other URL options, including TLS settings, are preserved. See [psycopg prepared statements](https://www.psycopg.org/psycopg3/docs/advanced/prepare.html).

Pool defaults are deliberately small: three retained connections and at most two overflow connections **per process**. Account for workers and the project's connection limit before increasing them. Connections use pre-ping, a ten-second connect timeout, and recycling. Alembic uses NullPool.

CORS_ORIGINS accepts comma-separated exact HTTP(S) origins. Add the actual frontend origin/port if it differs from localhost:5173; 127.0.0.1 is a separate origin. Wildcards are rejected and credentialed CORS is disabled. Never put DATABASE_URL, DIRECT_URL, database passwords, or Supabase service-role keys in frontend/ or Vite environment variables.

## Database migrations

Run from backend/ after configuring DIRECT_URL (or DATABASE_URL for fallback):

```powershell
alembic upgrade head
alembic current
alembic check
```

Revision `0001_core` creates subjects, tasks, availability, and study_sessions with UUID primary keys, timestamps, relationships, date/FK indexes, and check constraints. Enums use uppercase string values with database CHECK constraints. No dashboard risk fixtures are stored as calculated backend data.

To change the schema later, edit the models, then:

```powershell
alembic revision --autogenerate -m "Describe the schema change"
```

Review the generated upgrade/downgrade code before applying `alembic upgrade head`. Autogeneration is a proposal, not an assurance that every data migration is safe. Alembic reads the same environment settings as the app; no connection URL is stored in alembic.ini. Percent-escaped passwords bypass ConfigParser interpolation. See the [Alembic tutorial](https://alembic.sqlalchemy.org/en/latest/tutorial.html).

Do not create these tables manually in the Supabase dashboard. No destructive migration runs on application startup. A downgrade of the initial migration drops the tables and their data; use it only on an explicitly disposable database.

## Development server

From backend/ with the virtual environment active:

```powershell
uvicorn app.main:app --reload
```

The default server is available at [localhost:8000](http://localhost:8000).

- `GET /health` returns `{"status":"ok"}` without accessing PostgreSQL.
- `GET /health/db` performs SELECT 1 and returns a generic 503 if unavailable.
- [Swagger UI](http://localhost:8000/docs) and [OpenAPI](http://localhost:8000/openapi.json) describe the actual request and response schemas.

Without DATABASE_URL, health and API documentation still work; database endpoints return 503. An invalid configured URL fails setup with a clear error. Health alone is a liveness check, not proof that migrations or database connectivity are ready.

All /api resources and /health/db require a confirmed Supabase bearer token. /health and /docs remain public. Complete the authentication deployment steps before public use.

## Deterministic study scheduling

POST /api/planner/generate accepts inclusive date_from/date_to (1–31 days) and optional task_ids. It fills unreserved remaining work into availability using the documented deterministic policy, commits new PLANNED sessions atomically, and returns saved sessions plus complete/partial/unscheduled counts and reasons. Existing sessions and task progress remain untouched. Repeat generation fills only outstanding deficits; there is no destructive regenerate mode or schema migration.

The Calendar invokes this action for the displayed week. See [scheduler policy and API](../docs/scheduler.md) for exact ordering, 60/30-minute block rules, conservative DST handling, idempotency, and limits.

## API resources

All IDs are UUIDs. Each group supports:

```text
GET    /api/<resource>
POST   /api/<resource>
GET    /api/<resource>/{id}
PATCH  /api/<resource>/{id}
DELETE /api/<resource>/{id}
```

| Resource | Optional list filters |
| --- | --- |
| subjects | None |
| tasks | subject_id, status, priority, deadline_from, deadline_to |
| availability | date_from, date_to |
| study-sessions | task_id, status, date_from, date_to |

Lists return arrays, ordered consistently, with `offset=0` and `limit=100` defaults (maximum 500). Date ranges are inclusive; deadline filters require timezone-aware ISO timestamps. Inverted ranges are rejected.

POST returns 201 and the created resource; GET/PATCH return 200; DELETE returns an empty 204. Missing resources or referenced parents return 404, validation errors 422, resource conflicts 409, and unavailable database operations 503. SQL errors, SQL parameters, credentials, and stack traces are not exposed in API error responses. Errors include `detail`; request validation also supplies sanitized field location/message/type entries. Omitted PATCH fields remain unchanged; explicit null is rejected except optional subject color. Unknown request fields are rejected.

### Models and validation

All resources include id, created_at, and updated_at. UUIDs and timestamps are generated automatically; updated_at is maintained on SQLAlchemy updates (not by a database trigger for external SQL).

**Subject:** name, description, color. Names are trimmed and required (1–80 characters); descriptions allow up to 10,000 characters. Color is optional and accepts existing frontend tokens gold/purple/blue/green or a six-digit hex value. Deleting a subject with tasks is rejected, including completed/cancelled tasks.

**Task:** title, description, subject_id, deadline, estimated_hours, remaining_hours, priority, difficulty, progress, status.

- Title is required (1–160 characters). Subject must exist.
- estimated_hours is positive; remaining_hours is nonnegative and cannot exceed the total estimate. Revise the estimate first when more effort is needed. Both accept at most 999,999 hours.
- Effort is normalized to whole minutes, using half-up rounding. Estimates must round to at least one minute. JSON hours remain numbers, backed by fixed-precision database decimals.
- Remaining effort is authoritative. If only progress is supplied, it is converted to remaining minutes. Progress is a rounded integer, clamped below 100 when work remains. Contradictory explicit progress/remaining values are rejected.
- A status-only COMPLETED update sets remaining effort to zero and progress to 100; conflicting explicit values are rejected. Zero remaining effort completes a non-cancelled task. Partial progress normally yields IN_PROGRESS. CANCELLED retains its recorded effort/progress.
- Changing the total estimate alone preserves remaining effort and recalculates progress. No scheduling is triggered.
- Completing/cancelling retains future SCHEDULER reservations for approved replanning; the existing manual lifecycle cleanup preserves recorded history. An ongoing session must receive its outcome first. Changes invalidating manual/ongoing reservations are rejected; generated future blocks await explicit Replan preview/apply.
- Explicit task DELETE also deletes its linked sessions through the foreign key; this is different from completing/cancelling a task.

Enums: Priority LOW/MEDIUM/HIGH; Difficulty EASY/MEDIUM/HARD; TaskStatus TODO/IN_PROGRESS/COMPLETED/CANCELLED.

**Availability:** date, start_time, end_time. End must follow start on the same date. Times are local, minute-aligned, without UTC offsets. Overnight intervals must be split across dates. Same-date overlaps return 409; adjacent intervals are allowed. A change/delete that would uncover a manual or ongoing PLANNED session is rejected. Future generated blocks are preserved for explicit repair.

**StudySession:** task_id, date, start_time, end_time, planned_minutes, completed_minutes, status.

- Task must exist. The interval must be positive and fit entered availability when creating/moving it; adjacent availability intervals can jointly cover a session.
- planned_minutes is derived from elapsed time. It may be supplied, but must match. completed_minutes must be between zero and planned_minutes.
- Sessions cannot overlap on the same date, regardless of status. Adjacent sessions are allowed.
- PLANNED requires zero completed minutes, an active task, a future start, an end no later than its deadline, and total outstanding reservations no greater than its remaining effort.
- MISSED requires zero completed minutes; COMPLETED requires all planned minutes; PARTIALLY_COMPLETED requires more than zero and less than all minutes. Outcomes cannot be reported before the session ends.
- Recording new nonzero completed time requires input-only `task_remaining_hours` **or** `confirm_no_progress=true`. Study time is not assumed to equal task progress. Explicit remaining effort and the session outcome are saved atomically. A retried update sets the absolute effort value rather than deducting it again.
- Historical task/date/time cannot be moved after an outcome; outcome corrections are supported. Deleting a session does not infer a change to task effort.

StudySessionStatus: PLANNED/COMPLETED/MISSED/PARTIALLY_COMPLETED.

Deadlines are timezone-aware instants, normalized to UTC and persisted as TIMESTAMPTZ. Availability/session dates and times use the single workspace's APP_TIMEZONE (default Europe/Budapest). Nonexistent or ambiguous DST endpoints are rejected; actual elapsed time determines duration across a DST transition. Past deadlines are permitted for imported/overdue tasks; new planned sessions must satisfy the future/deadline rules.

All API mutations acquire a PostgreSQL transaction-scoped advisory lock for the current user before validating. This prevents concurrent requests from both passing overlap/capacity checks. Keep future mutation paths within these services. Direct SQL writers are not covered by these service-level cross-row checks. This deliberately simple serialization can be replaced with per-user locking when ownership is introduced.

## Development seed

Apply migrations, then run explicitly from backend/:

```powershell
python -m app.seed
```

The seed requires **all four core tables to be empty**. It refuses a nonempty database with a nonzero exit code and never clears or overwrites existing data. The entire seed is one transaction, so a failure rolls it back. Repeated runs therefore fail safely rather than duplicating demo data.

It creates four subjects (Databases, Project Management, Statistics, Diploma Thesis), twelve tasks, nine availability windows, and thirteen manually defined sessions, including completed/missed/partial history. IDs are stable UUIDv5 values. Dates default to the next future Monday with recent historical outcomes, avoiding obsolete fixed deadlines.

Optionally choose a future Monday:

```powershell
python -m app.seed --base-date YYYY-MM-DD
```

Replace YYYY-MM-DD with an actual future Monday. The seed is independent of frontend fixtures and does not calculate risk or plans. It never runs on startup.

## Tests and verification

From backend/:

```powershell
pytest
```

Every test gets a new **in-memory SQLite database** with foreign keys enabled. The app factory receives that isolated session factory and explicit settings with DATABASE_URL disabled. Tests never connect to Supabase or to the normal development database, even if DATABASE_URL is set. A test explicitly verifies this isolation.

The suite covers CRUD, foreign keys, filters, merged PATCH validation, completion consistency, availability/session overlaps and adjacency, invalid counts, capacity/deadline guards, outcome transactions, historical records, seed refusal, health/docs, CORS, pagination, and sanitized errors. Test metadata creation is limited to isolated fixtures; normal runtime uses Alembic.

SQLite does not verify PostgreSQL advisory locks, migration DDL, or PostgreSQL-specific types. Those need a **separate disposable local PostgreSQL database** for integration verification. Never point a test runner or destructive verification at the Supabase development database. PostgreSQL verification for this implementation used a temporary local PostgreSQL 18 cluster with no access to Supabase: migration upgrade/downgrade/upgrade, model drift check, seed and repeat refusal, CRUD, concurrent overlap rejection, and a real uvicorn HTTP smoke check. The disposable cluster was stopped and removed afterwards. Supabase connectivity, TLS, credentials, and project permissions still require the developer's own configuration.

Initial automated verification: 63 pytest tests passed on Python 3.15.0. The declared minimum is Python 3.12; a separate 3.12 runtime was not available in this environment. Windows sandbox restrictions required running TestClient checks with local event-loop socket access outside the sandbox.

## Next phase and limitations

The frontend REST adapter and DTO mapping are implemented. Scheduling is an explicit action; task/availability edits still do not trigger automatic replanning. Read-only deterministic risk assessment is implemented; affected-plan reconciliation is available through explicit preview/apply.

No risk values or planning decisions are fabricated by CRUD endpoints. Profiles and per-user authorization are persistent. Study preferences, automatic missed-session detection, unattended replanning and a real assistant endpoint remain unimplemented. These remain later phases. APP_TIMEZONE and profile timezone are currently constrained to Europe/Budapest; changing that requires a separate migration/reinterpretation design.

## Deadline risk assessment

`GET /api/risks` returns a single read-only batch of LOW/MEDIUM/HIGH task assessments and subject summaries with reasons, explanations and freshness metadata. No schema migration is needed. It uses canonical remaining effort and the scheduler's shared Budapest/DST-safe capacity utilities; it does not generate sessions or change progress. See [docs/risk-engine.md](../docs/risk-engine.md) for exact thresholds, competing-demand accounting and limitations. Tests use the existing isolated database strategy.

## Affected-plan replanning

Run `alembic upgrade head` before starting this version. Revision `0002_session_origin` adds constrained MANUAL/SCHEDULER origin metadata; all legacy rows remain MANUAL. New generation writes SCHEDULER, manual placement writes MANUAL, and user changes to task/date/time transfer a block to MANUAL. Request bodies cannot set origin.

`POST /api/planner/replan/preview` takes date_from/date_to (up to 31 days) and optional task_ids. `POST /api/planner/replan/apply` takes the same scope plus evaluated_at, fingerprint and plan_digest from the preview. Preview is read-only; Apply revalidates under the existing workspace lock, rejects stale/expired previews with 409 and atomically applies only the diff. No-op Apply writes nothing. See [docs/replanning.md](../docs/replanning.md) for preservation, deterministic displacement, risk comparison and scope limits. No service automatically invokes replanning on ordinary CRUD.


## Authentication setup and ownership

Read [docs/authentication.md](../docs/authentication.md). Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in backend/.env; set backend-only SUPABASE_SERVICE_ROLE_KEY for account deletion. Existing DATABASE_URL / DIRECT_URL behavior is unchanged. Run `alembic upgrade head` and `alembic check`, then apply `sql/avatars.sql` with the project administrator connection. Configure confirmed email, app redirects and optional Google provider in Supabase.

Migration 0003 adds profiles and nullable legacy ownership, per-user indexes, same-owner parent FKs, Auth-user cascade and restrictive RLS boundaries. Request sessions derive owners only from validated JWTs, scope ORM queries and SET LOCAL ROLE authenticated with local JWT claims on every transaction. Pure planning policies are unchanged. POST bodies never accept user_id. Replanning fingerprints are owner-bound. GET/PATCH /api/profile bootstrap/update the current profile; DELETE /api/account requires confirmation=DELETE and a backend-only admin operation.

Legacy rows stay invisible and are never auto-claimed. A trusted operator may explicitly run `python -m app.claim_legacy --user-id EXISTING_AUTH_USER_UUID --confirm-claim-legacy` after backup/review. Normal tests remain isolated SQLite with controlled identities and mocked Auth/Storage; they never register/delete real Supabase users. See the guide for the unexecuted live two-user acceptance checks and remaining provider configuration.
