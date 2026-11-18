# Tool-using AI Study Assistant

## Architecture and configuration

React's shared Assistant store calls authenticated FastAPI endpoints. The backend's bounded orchestration loop asks an AIProvider for normalized text/tool calls. An allowlist validates tool arguments using the same Pydantic schemas as ordinary resource endpoints. Read tools query the request-scoped SQLAlchemy session; confirmed commands call existing business services. The model has no SQL, database connection, credential, HTTP browsing, filesystem or arbitrary-code tool. Scheduler, Risk Engine and Replanner remain authoritative and their policies are unchanged.

Gemini is the only implemented provider. Its adapter uses the official [generateContent REST API](https://ai.google.dev/api/generate-content) with functionDeclarations/parametersJsonSchema. Complete model content, including opaque thought signatures, is retained unchanged during each multi-step tool loop; matching function call IDs are returned in function responses. There is no automatic provider fallback and no SDK that can execute functions autonomously.

Set these in ignored **backend/.env**, never frontend files:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=YOUR_ENABLED_GEMINI_MODEL_ID
GEMINI_API_KEY=YOUR_LOCAL_SERVER_KEY
AI_TIMEOUT_SECONDS=15
```

Use a model available to your Google project that supports generateContent and function calling. No model/version is silently selected. The checked-in .env.example leaves the model and key empty. Enable the Gemini API and configure project quota/billing as appropriate. Restart FastAPI after changing configuration. Ordinary planner features work without Gemini; chat returns a safe unavailable response. Existing Supabase Auth and CORS configuration is still required.

Run `alembic upgrade head` before starting this version. Migration 0004_assistant_actions adds only confirmation-command metadata and RLS; it does not alter planner records. Nothing runs migrations on startup. No frontend dependency or provider key is needed.

OpenAI is **not implemented**. Add an adapter implementing ai/base.py AIProvider.generate, normalize calls into Generation/ToolCall, keep provider wire history inside that adapter, register it in get_provider and add mocked wire-contract tests. The generic orchestration/tools and frontend need no provider-specific changes. Do not configure AI_PROVIDER=openai yet.

## Prompt and grounding

The system prompt in app/ai/prompts/system.py requires current tool results for planner facts, concise explanations, necessary clarification, explicit resolved dates and the fixed Europe/Budapest timezone. Task mutation tools accept a literal local deadline (`YYYY-MM-DDTHH:MM`); the backend converts it using the canonical local_instant utility, rejecting model-supplied UTC offsets and ambiguous/nonexistent DST times. Stored pending payloads use canonical aware instants and are never reinterpreted as local clocks during confirmation. Student text and old chat are untrusted context, not instructions or authoritative current state. Never infer unknown subject IDs, deadlines or essential task details. Success is not claimed for a proposal. Scheduler ordering, capacity and risk thresholds are never delegated to the model.

For today's recommendation the model should inspect get_today_plan, get_tasks and get_risks. For overall feasibility use assess_workload: it calls the existing pure Risk Engine on immutable task copies capped to the earlier of the actual deadline or the requested local horizon end, restricts availability to that range, reports per-task reservations/deficits and persists nothing. This prevents sessions reserved next week from falsely proving that work can finish this week. All existing reservations remain fixed; the result is explicitly a what-if assessment, not a changed saved deadline/risk. Shared contingency slack from risk assessments must not be added across tasks. Risk explanations come from the engine, rather than a second LLM risk formula. Model wording can still be mistaken; the UI shows original deterministic risk/preview details for review.

## Tools

| Read-only tool | Result |
| --- | --- |
| get_profile_context | Display name, fixed timezone and current local time; no email/auth/avatar data. |
| get_subjects | IDs/names for resolving an existing subject; capped at 100 with truncation flag. |
| get_today_plan / get_week_plan | Actual local-day/current Monday–Sunday sessions, statuses, task/subject names, planned minutes; today also includes bounded active-task effort/priority/live-risk context so a single tool call can support a grounded recommendation. |
| get_tasks / get_deadlines | Paginated task context and canonical remaining minutes, optionally bounded by local deadline dates/subject. Active tasks by default. |
| get_task_details | One owned task, with description capped at 1,000 characters. |
| get_risks | Existing deterministic task/subject assessment batch and freshness metadata. |
| get_subject_summary | Owned subject, tasks and live subject risk. |
| get_availability | Paginated local windows; defaults to today through the next 31 days. Windows are not claimed to be free capacity. |
| assess_workload | Read-only deadline-capped Risk Engine feasibility/shortfalls for an explicit 1–31 day horizon. |
| preview_replan | Read-only existing replanning diff, risk comparison and original version fields. |

Queries have limit 30 by default, maximum 50, and return has_more/next_offset. Session/subject summaries explicitly flag truncation. The assistant must narrow or paginate rather than assume an incomplete result represents all work. UUID lookups are owned automatically; guessed foreign IDs return safe not-found results. Unknown tools, extra arguments including user_id, invalid enums and malformed values are rejected.

Mutating tools **only propose**, never execute in the model loop:

- create_task; update_task (including explicit completion/cancellation).
- create_availability; update_availability; delete_availability.
- generate_study_plan (persists scheduler sessions).
- apply_replan (exact existing preview version).

There is no generic SQL/CRUD/delete-account/delete-task tool. A task update explains existing lifecycle effects, including possible cleanup of future manual reservations when closing a task; recorded history is preserved by the existing service. Session outcome entry and manual placement remain ordinary validated calendar UI actions.

## API and confirmation contract

- POST /api/assistant/message: `{message, history?: [{role: 'user'|'assistant', content}]}`. Authenticated identity comes exclusively from JWT/session dependency. Response contains message, provider/model metadata, structured read-result actions and optional confirmation.
- POST /api/assistant/replan/propose: takes an exact existing ReplanApply version from a read-only preview; revalidates it and creates a pending confirmation without an LLM call or planner changes.
- POST /api/assistant/actions/{id}/confirm: **empty JSON object only**. Executes the stored payload, not client-supplied parameters.
- POST /api/assistant/actions/{id}/cancel: empty JSON object. Consumes a proposal without planner changes.

A mutation proposal creates an unguessable UUID action row containing owner, exact validated payload, user-facing summary, current owned-data fingerprint, expiration and status. The first proposal ends that model turn, even if it asks for multiple/parallel writes. The frontend renders Review / Confirm / Cancel. Typing 'yes', replaying chat or the LLM calling a mutation again cannot confirm a stored action.

Every proposal expires after five minutes (or the earlier replanning preview expiry). Confirm locks the current user's workspace and the action row, checks owner/status/expiry and a full owned planner snapshot fingerprint, then invokes the existing service. All ordinary service commit boundaries remain unchanged; within this explicit assistant unit of work the shared commit helper flushes instead. The command, consumed status and result receipt commit in **one transaction**. Validation/SQL failure rolls back all of them. Retrying Confirm returns the stored successful receipt and never executes twice. Cancelled/expired/stale actions cannot execute. Failed/uncertain network responses may retry the **same action ID** safely; do not resend the natural-language request to recover an uncertain confirmation.

Fingerprinting is deliberately conservative: any change to this user's subjects, tasks, availability or sessions invalidates the proposal. Other users' changes do not. Replanning also retains all existing evaluation-time, diff-digest, five-minute and session-start protections. Request a fresh proposal/preview after a 409. A confirmed receipt remains valid for retry even if planner state later changes; this is a receipt, not a new execution.

Pending/result metadata is protected by same-owner ORM scope and PostgreSQL FORCE RLS. Additionally, both restrictive and permissive assistant_actions policies require transaction-local `app.assistant_access=on`. Only the trusted assistant route's SQLAlchemy session sets that flag. Ordinary authenticated/PostgREST requests cannot create, alter or replay proposals just by knowing their IDs. Do not deploy database RPCs that let untrusted callers set arbitrary GUCs or bypass this boundary. Database administrators remain trusted. Auth-user/profile deletion cascades action metadata. Creating a new proposal cleans that user's expired action metadata older than 24 hours; inactive users' metadata persists until later use or account deletion. A scheduled retention job may be added later.

## Replanning and changed constraints

The assistant reads the current plan/risks, calls preview_replan, and can call apply_replan with the returned exact version to offer a confirmation card. If the model returns only a read-only preview, its card provides Review for Apply: that explicit UI action calls /assistant/replan/propose and obtains a server-owned confirmation without relying on another model turn. Review itself never changes planner sessions; the later Confirm is still required. The card reuses the normal Calendar ReplanDetails: moved/created/removed/kept sessions, unscheduled work, affected tasks and before/after risk. Confirm calls existing replanning.apply. No model-generated moves are accepted. After a saved command the shared core collections and risks refresh; stale calendar previews are cleared.

'I cannot study tonight' does **not** secretly remove availability. This first version requires two approvals: resolve and confirm the exact availability edit/removal, then request a new replanning preview and confirm applying that current-state preview. preview_replan does not simulate a hypothetical availability change. The assistant must explain that distinction and must not claim a counterfactual risk/diff was calculated. Existing manual/ongoing availability guards may reject the edit, requiring a normal session edit first. There is no autonomous background replanning.

## Conversation and frontend

Dashboard panel and full Assistant page share one account-bound store. Starter actions send normal API messages, not canned answers. The existing bubbles, composer, colors and card styles are retained. Enter submits; busy state disables duplicate sends/actions; errors support message retry. Mutation errors retain the proposal for exact-ID retry except known stale/expired/not-found responses. Confirmation cards show resolved values and original deterministic replan details. Plain text is escaped by React; no HTML/markdown execution is enabled.

Conversation text is **session-local browser memory**, capped at 80 displayed messages and cleared on reload, sign-out or account switch. Account-keyed workspace teardown disposes the store and suppresses late responses; another account cannot see previous chat or use its proposal IDs. Each request sends only the last 12 user/assistant messages, trimmed to 16,000 characters server-side. Tool/system roles cannot be supplied by clients. Chat history is untrusted, never authorization. Tool wire history/signatures exist only during one backend turn; later turns reread relevant state. Pending commands and receipts are persistent, but there is no chat table or cross-device chat resume.

## Cost, privacy and failures

- User message maximum 2,000 characters; at most 12 history entries of 4,000 characters each before total trimming.
- Six model rounds, at most 20 tool calls and a 75-second orchestration budget; configured per-call network timeout defaults to 15 seconds. The adapter also checks elapsed time on response headers/chunks; an in-flight blocking network phase can finish after the budget, bounded by its phase timeout. Browser message timeout is 90 seconds. Gemini output capped at 2,048 tokens and 1 MB transport response.
- Identical read calls are cached within one turn only; tool results capped at 80,000 characters each and 100,000 cumulatively. Oversized results return an explicit narrowing error.
- Per-user limit 10 messages/minute/process; at most 20 unexpired pending actions. Rate memory is bounded. Multiworker/distributed quota enforcement is a future deployment concern.
- Initial external context includes only display name, fixed timezone and current local time. Tool-driven context can include subject/task names, owned IDs, dates/deadlines, effort/progress/status/priority, requested task description, study windows/sessions, deterministic risk/explanations and replanning results. Chat input/history is also sent. Do not put passwords or other secrets into task descriptions or chat. Review the chosen provider's data-processing and retention terms before using sensitive academic information.
- Backend never deliberately sends email, avatar path/binary, JWT/access/refresh tokens, database connection information, API keys or another user's state as model context. Gemini key goes only in its HTTPS authentication header. Provider response bodies/credentials are not logged or returned in error messages.
- Invalid tools return safe corrective results without executing; provider timeout/rate-limit/malformed responses return sanitized errors and do not change planner data. There is no silent paid-provider fallback. A confirmation failure is a different case: an interrupted response may have committed, so recover by retrying the exact confirmation ID or refreshing, never by claiming unchanged data blindly.

## Verification and manual live acceptance

Normal pytest uses a fake provider/HTTPX MockTransport and isolated SQLite. Frontend tests mock HTTP/provider responses; neither normal suite requires Gemini, Supabase or a paid API call. Coverage includes tool rounds and caps, malformed arguments, wire signatures/call IDs, user isolation, exact confirmations/replays, cancellation/expiry/staleness, rollback, canonical scheduler/risk/replan behavior, UI loading/retry/cards and account teardown.

Implementation verification applied migration 0004 and ran alembic check against the configured Supabase PostgreSQL database. Rolled-back SQL checks verified both RLS policies: an authenticated-role INSERT without the trusted backend flag is rejected, while trusted assistant context passes RLS and reaches the expected missing-profile FK check without creating records. Running FastAPI health returned 200 and live OpenAPI included the assistant routes. After local Gemini configuration, live authenticated checks used a disposable confirmed Supabase Auth account, real PostgreSQL, the actual Gemini adapter and FastAPI through an ASGI TestClient (not a mocked provider):

- Today's response used actual persisted sessions and local study times.
- Risk explanation correctly reported six remaining hours, four hours of capacity, a two-hour shortfall and the 22:00 Budapest deadline; workload assessment used the existing Risk Engine.
- Natural-language task creation produced a proposal with the requested Friday 18:00 local deadline and no task before Confirm. Confirm persisted exactly one task; replay returned the same receipt, and fresh reads retained it.
- Removing tonight's availability required its own confirmation. Replanning returned a deterministic read-only preview; the Review for Apply route created its pending approval without changing sessions. Confirm persisted the diff, preserved the manual block and produced no overlaps or after-deadline sessions. Fresh reads retained the applied result.
- Disposable Auth accounts were deleted after all attempts. Cleanup was checked separately against Auth/application tables. Existing users' data was not modified.

Live checks exposed model timezone-conversion mistakes; task writes now take local-clock input and read tools provide backend-resolved deadline_local fields. The model sometimes returns a preview without calling apply_replan; the Review for Apply path makes that flow usable without treating chat text as approval. Regression tests cover both corrections.

Final offline verification: 253 backend tests and 89 frontend tests passed; frontend lint/build and git diff --check passed. Browser login/reload and clicking these controls against the live account were **not** exercised; persistence here was verified through fresh authenticated API reads. Cross-user isolation, stale previews and account-switch UI behavior remain covered by automated isolated tests, rather than a second live user in this Gemini run.

After local configuration, use only an authenticated disposable/test account:

1. Ask 'What should I study today?' and compare all cited tasks/sessions/times against Calendar.
2. Ask why the highest-risk task is risky; compare the exact Risk Engine values/explanation.
3. Ask 'Can I finish everything this week?' and inspect actual workload shortfalls; do not add shared slack across tasks.
4. Ask for a high-priority three-hour task for an existing unambiguous subject due Friday at 18:00. Check exact local resolved date/time, verify no task before Confirm, confirm, reload and verify persistence. Retry the same confirmation request and verify no duplicate.
5. Ask to replan; verify preview has no planner writes, review risk/diff/shortfalls, confirm, reload Calendar and verify persisted changes. For tonight's availability constraint, approve the availability edit first, then obtain a fresh preview and approve that separately.
6. Change a task after a proposal; Confirm must reject it as stale. Check second-user guessed IDs cannot read/confirm the first user's proposal or entities. Sign out/switch accounts; no old chat should flash.
7. Remove only temporary test records and restore any edited test availability. Do not delete unrelated planner history.

## Known limits

No streaming, conversation persistence/search, attachments, voice, web/RAG, automatic provider failover, distributed billing/rate storage, session-outcome chat tool or single-confirmation hypothetical availability/replan compound command. One mutation proposal is handled per turn. The existing greedy/minute/DST-conservative planning policies and fixed Budapest timezone still apply. Model answers are probabilistic explanations; deterministic result cards and backend validation remain authoritative. Production deployment needs provider credentials, quota/privacy review, reverse-proxy/request limits and a decision on centralized rate limiting/receipt retention.
