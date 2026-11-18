# Authentication, profiles and personal workspaces

## Architecture and trust boundary

Supabase Auth owns credentials, email confirmation, recovery and OAuth identities. React uses the official Supabase JS client for Auth and private avatar Storage only. Core application data still flows through FastAPI -> services -> SQLAlchemy -> PostgreSQL. No browser database password, service-role key, direct core-table client or AI integration is introduced.

The central API client obtains the current Supabase access token and adds `Authorization: Bearer ...`. Missing/expired sessions fail closed; 401 clears local auth state without a retry loop. Network/provider failures return understandable errors. Authenticated planner providers are keyed by user ID, disposed on sign-out/account switch, clear all entities/risks/previews/results and ignore late responses. A pinned-account token getter prevents an old request from acquiring a different account's token. Profile requests also discard obsolete account responses. Supabase persists and refreshes its session; auth resolution gates the whole planner before data loading.

## Backend verification

`app/core/auth.py` is the single reusable authentication dependency. It requires Bearer credentials and derives a canonical UUID from the verified Supabase user, never request JSON/query parameters. ES256/RS256 signatures use the fixed project JWKS URL, fixed algorithms, issuer, authenticated audience, expiry/issued-at/subject requirements and authenticated role. Keys are cached for five minutes and unknown key IDs are refreshed by PyJWT. Header `jku` URLs are not trusted. Legacy HS256 tokens are validated by Supabase's authenticated `/auth/v1/user` endpoint, not decoded and trusted locally. All accepted tokens also receive an online user lookup: deleted identities, unconfirmed email and anonymous identities are rejected. Provider/key-network failures return 503; missing/invalid/expired identities return 401. There is no development auth bypass setting.

Sign-out is local to the current browser session. Supabase access JWTs are stateless; sign-out is not a promise to revoke every previously issued bearer token immediately. Account deletion is additionally checked against the live Auth user so a still-unexpired deleted-user JWT cannot bootstrap a new profile. Configure suitable token lifetimes and HTTPS before deployment.

## Profiles and ownership

`profiles.user_id` is the Auth UUID primary key. The table stores display_name, optional avatar_path, fixed Europe/Budapest timezone and UTC timestamps, not email/password. Email comes from Supabase Auth. `GET /api/profile` bootstraps an idempotent Student profile using ON CONFLICT DO NOTHING; `PATCH /api/profile` validates edits. Core writes can bootstrap the profile too. No auth metadata is trusted to change ownership.

Each Subject, Task, Availability and StudySession has indexed user_id -> profiles.user_id with cascade deletion. Existing opaque IDs, timestamps, effort/status and time semantics are retained. Composite owner/parent foreign keys prevent tasks referencing another owner's subject and sessions referencing another owner's task. Deferred NO ACTION parent constraints permit a complete account cascade while ordinary subject-with-tasks deletion remains rejected by services.

Every FastAPI database dependency requires a validated principal and binds its ID for the lifetime of that request's session. `db/ownership.py` adds ownership criteria to ORM SELECT/UPDATE/DELETE, assigns/checks owners before flush, and rejects ownership reassignment. All existing repository/service calls, pagination, joins and batch planning reads therefore share the same scope without copying filters into every component. On **every PostgreSQL transaction**, including a refresh after service commit, it sets local JWT claims and `SET LOCAL ROLE authenticated`; RLS provides a second boundary even for Core SQL. Do not create an unscoped session inside a new API route. Unscoped sessions are reserved for explicit trusted operator tools and isolated test setup.

Scheduler/risk policies are unchanged. Their orchestration loads only the current user's snapshots and generated sessions receive that owner. Advisory locks are per user. Replanning fingerprints include owner ID as well as owned snapshot/scope; an empty preview cannot be replayed across users, unrelated users' writes do not invalidate a personal preview, and existing stale/time/diff checks remain.

## Migration and legacy data

Run from backend with the configured migration connection:

```powershell
alembic upgrade head
alembic check
```

Revision `0003_auth_ownership` creates profiles, same-owner constraints, indexes and RLS. It requires Supabase's existing auth.users/auth.uid()/authenticated/anon roles. The external Auth FK is explicitly owned by this migration; Alembic excludes only that known external FK from ORM autogeneration because auth.users is not an application model. The Auth-user -> profile FK and profile -> owned-record FKs cascade. RLS is ENABLED and FORCED on all five tables. A permissive own_rows policy and restrictive owner_boundary policy apply `auth.uid() = user_id` to reads and writes, covering SELECT/INSERT/UPDATE/DELETE and preventing a preexisting broad policy from opening other owners' rows. Anonymous table grants are revoked. Runtime SQL connections must be permitted to SET ROLE authenticated; the normal Supabase project PostgreSQL login supports this workflow. Never grant browser clients the database login.

Legacy user_id remains NULL: rows are preserved, hidden from all authenticated workspaces, never automatically assigned to the first registrant, and not removed by account deletion. New production users start empty. Normal authenticated writes cannot create NULL ownership under RLS.

To intentionally adopt **all** legacy rows into one existing Auth account, stop application writes, back up the database, identify that account in Supabase Auth and run explicitly:

```powershell
python -m app.claim_legacy --user-id EXISTING_AUTH_USER_UUID --confirm-claim-legacy
```

This administrator-only command has no API endpoint. It creates the target profile if needed, updates only NULL owners transactionally, preserves already-owned rows, and rolls back inconsistent parent ownership. It never invents an Auth identity; PostgreSQL's Auth FK rejects an unknown user. The development seed remains explicit, requires empty core tables and produces quarantined legacy data until deliberately claimed. Downgrade refuses to discard profiles silently; export/manage authenticated accounts before rollback.

## Supabase configuration

Use the same Supabase project for Auth, PostgreSQL and Storage. Obtain the project HTTPS URL and publishable key from project settings. Keep secrets only in ignored environment files.

Backend `.env`:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_BACKEND_ONLY_ADMIN_KEY
APP_TIMEZONE=Europe/Budapest
CORS_ORIGINS=http://localhost:5173
```

Retain DATABASE_URL for runtime and DIRECT_URL for migrations as described in backend/README.md. The admin key is needed only for account deletion, never token verification or ordinary CRUD. Store it securely; do not paste it into frontend configuration or logs. Modern server secret keys/legacy service-role keys belong only on the server. Backend environment parsing uses SecretStr. No real key is included in examples.

Frontend `.env.local`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Use an actual `sb_publishable_...` key or legacy anon JWT, not these placeholder words. Build/start validation rejects secret/service-role keys and secret-looking VITE variable names. Do not put DATABASE_URL, DIRECT_URL or a service-role key anywhere under frontend. Restart FastAPI and Vite after setting environment variables.

In Supabase Auth:

1. Enable email/password registration and **Confirm email**. Configure suitable password requirements (UI requires at least eight characters), email templates and SMTP delivery/rate limits.
2. Set Site URL to the actual frontend origin. For development allow `http://localhost:5173/**`; production should allow only the actual `/auth/callback` and `/reset-password` paths, including provider-added query parameters where needed. Avoid wildcard production origins. If using another port/127.0.0.1, add that precise origin to backend CORS and Auth redirects.
3. Email confirmation returns to `/auth/callback`; password recovery returns to `/reset-password`. SDK PKCE code exchange and URL handling occur before session restoration completes. Open links in the browser where the flow began; cross-browser PKCE recovery needs a separately designed OTP/template flow. Reset form requires recovery mode, not merely any existing login. Recovery mode is scoped to the current identity in sessionStorage and cleared on success/sign-out/account switch.
4. To keep core data writes exclusively through FastAPI, disable Supabase Data API exposure for application tables (or disable Data API if unused). Auth and Storage use their own APIs. RLS still protects the tables if Data API is enabled, but own-row direct writes would bypass service-only planning validations.

### Google OAuth

Code is implemented via `signInWithOAuth({provider:'google'})`. In Google Cloud create a Web OAuth client, configure the consent screen/test users and allow the Supabase Auth callback `https://PROJECT_REF.supabase.co/auth/v1/callback`. Put the Google client ID/secret in Supabase's Google provider configuration and enable it. The Google secret never belongs in this repository or frontend. Allow the app's `/auth/callback` redirect in Supabase. Provider/dashboard configuration and a real Google login still require operator verification.

## Private avatars

Run the exact, repeatable administrator SQL in [backend/sql/avatars.sql](../backend/sql/avatars.sql) once per environment. It creates a private avatars bucket with a 2 MB limit and PNG/JPEG/WebP MIME allowlist, refuses to silently adopt an incompatible bucket, and creates own-prefix plus restrictive boundary policies on storage.objects. Other buckets are unaffected. The boundary also prevents another permissive policy from opening avatar files. Bucket writes require flat `<auth-user-uuid>/<random-uuid>.png|jpg|webp` paths; users can select/delete only their own prefix. Public avatar URLs are never used.

The browser validates size, MIME/signature and, when available, image decoding/dimensions (maximum 4096 × 4096). SVG is rejected. Upload uses a new UUID path with no overwrite. Profile PATCH validates ownership/path and checks the authenticated stored object's MIME/size before accepting its path. Replacement saves the new profile pointer before deleting the old object; rejected saves delete only the new upload. Removal clears the profile pointer before object cleanup. Account deletion removes orphaned own-prefix avatar files as well. Browser display uses a five-minute signed URL, refreshed with profile loading every four minutes and no referrer. Signed URLs are short-lived bearer capabilities, not an assurance that a copied link is bound to one viewer.

## Account deletion

`DELETE /api/account` requires the current validated principal and `{ "confirmation": "DELETE" }`. Settings requires typing DELETE and explains permanent loss. No target user ID is accepted. FastAPI uses the backend-only admin credential to remove only that identity's avatar prefix, then deletes that exact Auth user through the provider Admin API. The Auth FK cascades profile and owned core data atomically in the provider's database; other users and quarantined legacy rows are untouched. Frontend clears local auth/planner state only after a successful server response. Missing admin configuration or a provider failure leaves the account signed in and exposes a retryable error, not false success.

Storage and Auth deletion cannot form one distributed transaction: a failed Auth deletion can follow successful avatar removal. Core data/Auth remain intact if Auth deletion fails; retry is safe. A timeout may leave an unknown outcome, and subsequent authoritative authentication will resolve whether the user still exists. Other application buckets/custom Auth-delete hooks may block deletion and require operator review. This feature is irreversible; the test setup never calls it on a real user's account.

## Verification and current limits

Normal backend tests use isolated SQLite and controlled dependency-injected identities; JWT tests use temporary signing keys and mocked provider/JWKS responses. Existing database/bootstrap tests now explicitly supply their controlled identity rather than bypassing auth in production. Frontend tests mock HTTP/Auth/Storage and cover loading gates, login/confirmation/recovery, profile, avatar sequencing, authorization failures, account switching, destructive confirmation and planner-store disposal, while preserving scheduler/risk/replan coverage.

During this implementation the real PostgreSQL migration and Alembic drift check succeeded; existing 4 subjects, 13 tasks, 9 availability windows and 18 sessions were verified unchanged except new NULL ownership. RLS ENABLE/FORCE flags, Auth cascade FK and private avatar bucket configuration were checked. **Live signup/email delivery, two real disposable Auth accounts, OAuth, user-token RLS/storage requests and real account deletion were not executed**: Auth URL/public/admin credentials were not configured, and the user requested implementation with those live checks documented instead. No Auth users were fabricated through SQL and no legacy claim was executed.

Complete operator acceptance after configuration: register and confirm two disposable users; create/generate A and B workspaces independently; attempt guessed IDs both ways (404); compare per-user risks; preview/apply only own replan; verify A cannot apply B's preview; reload and restore each session; sign out/switch without old data; upload private avatars and deny the other account's direct read; delete only these disposable accounts with typed confirmation and check all owned records/objects are gone. Confirm no legacy data changed. Verify SMTP, recovery links, Google callback and deletion failure/retry paths in the intended deployment.

Timezone is intentionally fixed to Europe/Budapest in profiles/backend configuration; arbitrary per-user timezone scheduling is not added. Study/appearance preferences other than account profile remain local prototypes. There is no MFA, enterprise/team auth, AI/LLM, social data or shared workspace. Browser session storage requires an appropriate XSS/HTTPS/deployment policy before public release. Production dependency audit reported zero advisories; the existing development toolchain still reports 14 advisories and requires a separate compatibility review rather than an unrelated forced Vite downgrade.

References: [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys), [user deletion and JWT lifetime](https://supabase.com/docs/guides/auth/managing-user-data), [Storage policies](https://supabase.com/docs/guides/storage/security/access-control), [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [Google configuration](https://supabase.com/docs/guides/auth/social-login/auth-google).
