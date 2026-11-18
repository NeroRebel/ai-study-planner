import type { ReplanPreview } from "../api/replanning";
import type { GeneratePlanInput, GeneratePlanResult } from "../api/planner";
import type { AppApi } from "../api";
import { errorMessage } from "../api/client";
import { createInitialState } from "./appState";
import type { AppAction, AppState } from "./appState";

export interface DataSnapshot {
  replanStatus: "idle" | "previewing" | "ready" | "applying" | "applied" | "error";
  replanPreview: ReplanPreview | null; replanError: string; replanMessage: string;
  replanRange: GeneratePlanInput | null;
  riskStatus: "loading" | "ready" | "error"; riskError: string; riskExpiresAt: string | null;
  generating: boolean; generationResult: GeneratePlanResult | null; generationError: string;
  generationRange: GeneratePlanInput | null;
  state: AppState; status: "loading" | "ready" | "error";
  error: string; mutationError: string; pending: boolean;
}
export function createAppDataStore(api: AppApi, initialName?: string) {
  let snapshot: DataSnapshot = { replanStatus: "idle", replanPreview: null, replanError: "", replanMessage: "", replanRange: null, riskStatus: "loading", riskError: "", riskExpiresAt: null, generating: false, generationResult: null, generationError: "", generationRange: null, state: createInitialState(), status: "loading", error: "", mutationError: "", pending: false };
  if (initialName) snapshot.state.preferences.name = initialName;
  let disposed = false;
  const listeners = new Set<() => void>();
  let loading: Promise<void> | null = null;
  let riskRevision = 0;
  let riskRequest: { revision: number; promise: Promise<void> } | null = null;
  function publish(change: Partial<DataSnapshot>) {
    if (disposed) return;
    snapshot = { ...snapshot, ...change };
    listeners.forEach(listener => listener());
  }
  function invalidateRisks() {
    riskRevision++;
    riskRequest = null;
    publish({ riskStatus: "loading", riskError: "", state: { ...snapshot.state,
      risks: snapshot.state.risks.map(risk => ({ ...risk, stale: true })),
      subjectRisks: snapshot.state.subjectRisks.map(risk => ({ ...risk, stale: true })),
    } });
  }
  async function refreshRisks(force = false): Promise<void> {
    if (snapshot.status !== "ready" || (snapshot.pending && !force)) return;
    if (riskRequest?.revision === riskRevision) return riskRequest.promise;
    const revision = riskRevision;
    publish({ riskStatus: "loading", riskError: "" });
    const promise = (async () => {
      try {
        const result = await api.risks.read();
        if (revision !== riskRevision) return;
        publish({ riskStatus: "ready", riskError: "", riskExpiresAt: result.expires_at,
          state: { ...snapshot.state, risks: result.tasks, subjectRisks: result.subjects } });
      } catch (error) {
        if (revision !== riskRevision) return;
        publish({ riskStatus: "error", riskError: errorMessage(error), riskExpiresAt: null,
          state: { ...snapshot.state, risks: [], subjectRisks: [] } });
      } finally { if (riskRequest?.revision === revision) riskRequest = null; }
    })();
    riskRequest = { revision, promise };
    return promise;
  }
  async function load() {
    if (disposed) return;
    if (loading) return loading;
    if (snapshot.replanStatus === "ready") cancelReplan();
    invalidateRisks();
    loading = (async () => {
      try {
        const [subjects, tasks, availability, sessions] = await Promise.all([
          api.subjects.list(), api.tasks.list(), api.availability.list(), api.sessions.list(),
        ]);
        publish({ state: { ...snapshot.state, subjects, tasks, availability, sessions },
          status: "ready", error: "" });
      } catch (error) {
        publish({ status: "error", error: errorMessage(error) });
      } finally { loading = null; }
    })();
    await loading;
    // Core pages render before risk finishes. Risk failure never fails entity loading.
    if (snapshot.status === "ready") await refreshRisks(true);
  }
  // Forms may hold ORM/read fields. Explicitly whitelist the API write contract.
  function taskPayload(input: Extract<AppAction, { type: "save-task" }>["input"]) {
    const { title, description, subject_id, deadline, estimated_hours, progress, priority, difficulty, status } = input;
    return { title, description, subject_id, deadline, estimated_hours, progress, priority, difficulty, status };
  }
  async function dispatch(action: AppAction): Promise<string | null> {
    if (disposed) return "Your session has ended. Please sign in again.";
    if (action.type === "preferences") {
      publish({ state: { ...snapshot.state, preferences: action.value } });
      return null;
    }
    if (snapshot.pending || loading) return "Please wait for the current request to finish.";
    if (snapshot.status !== "ready") return "Load your workspace before making changes.";
    cancelReplan();
    publish({ pending: true, mutationError: "" });
    invalidateRisks();
    let failed = false;
    try {
      switch (action.type) {
        case "save-task": {
          const old = snapshot.state.tasks.find(task => task.id === action.id);
          const input = taskPayload(action.input);
          if (old) {
            const changes = Object.fromEntries(Object.entries(input).filter(([key, value]) =>
              old[key as keyof typeof input] !== value));
            await api.tasks.update(old.id, changes);
          } else await api.tasks.create(input);
          break;
        }
        case "complete-task": await api.tasks.update(action.id, { status: "COMPLETED" }); break;
        case "delete-task": await api.tasks.remove(action.id); break;
        case "save-subject":
          if (action.id) await api.subjects.update(action.id, action.input);
          else await api.subjects.create(action.input);
          break;
        case "delete-subject": await api.subjects.remove(action.id); break;
        case "save-availability": {
          const { date, start_time, end_time } = action.window;
          const input = { date, start_time, end_time };
          if (snapshot.state.availability.some(window => window.id === action.window.id))
            await api.availability.update(action.window.id, input);
          else await api.availability.create(input);
          break;
        }
        case "delete-availability": await api.availability.remove(action.id); break;
        case "save-session": {
          const { task_id, date, start_time, end_time, status, completed_minutes,
            task_remaining_hours, confirm_no_progress } = action.input;
          const input = { task_id, date, start_time, end_time, status, completed_minutes,
            task_remaining_hours, confirm_no_progress };
          if (snapshot.state.sessions.some(session => session.id === action.id))
            await api.sessions.update(action.id, input);
          else await api.sessions.create(input);
          break;
        }
        case "delete-session": await api.sessions.remove(action.id); break;
      }
      // Include server-side effects (task closure/session removal and atomic outcomes).
      await load();
      return null; // Write succeeded even if refresh failed; don't invite duplicate POSTs.
    } catch (error) {
      failed = true;
      const message = errorMessage(error);
      publish({ mutationError: message });
      return message;
    } finally {
      publish({ pending: false });
      if (failed) await refreshRisks();
    }
  }
  async function generatePlan(input: GeneratePlanInput): Promise<void> {
    if (snapshot.pending || loading || snapshot.status !== "ready") return;
    cancelReplan();
    publish({ pending: true, generating: true, generationResult: null, generationError: "", generationRange: input });
    invalidateRisks();
    let failed = false;
    try {
      const result = await api.planner.generate(input);
      publish({ generationResult: result });
      await load(); // Reuse the normal shared refresh, including the committed sessions.
    } catch (error) {
      failed = true;
      publish({ generationError: errorMessage(error) });
    } finally {
      publish({ pending: false, generating: false });
      if (failed) await refreshRisks();
    }
  }
  function cancelReplan() {
    if (snapshot.replanStatus === "applying" || snapshot.replanStatus === "previewing") return;
    publish({ replanPreview: null, replanStatus: "idle", replanError: "", replanMessage: "" });
  }
  async function previewReplan(input: GeneratePlanInput): Promise<void> {
    if (snapshot.pending || loading || snapshot.status !== "ready") return;
    publish({ pending: true, replanStatus: "previewing", replanPreview: null,
      replanError: "", replanMessage: "", replanRange: input });
    try {
      const result = await api.replanning.preview(input);
      publish({ replanPreview: result, replanStatus: "ready" });
    } catch (error) {
      publish({ replanError: errorMessage(error), replanStatus: "error" });
    } finally { publish({ pending: false }); }
  }
  async function applyReplan(): Promise<void> {
    const preview = snapshot.replanPreview;
    if (snapshot.pending || snapshot.replanStatus !== "ready" || !preview) return;
    publish({ pending: true, replanStatus: "applying", replanError: "" });
    invalidateRisks();
    try {
      const result = await api.replanning.apply(preview);
      // A committed result must survive refresh failure; never offer the old apply again.
      publish({ replanPreview: null, replanMessage: `Study plan updated: ${result.sessions_moved.length} moved, ${result.sessions_created.length} added, ${result.sessions_removed.length} removed.${result.unscheduled_minutes ? ` ${result.unscheduled_minutes} minutes remain unscheduled.` : ""}` });
      await load();
      publish({ replanStatus: "applied" });
    } catch (error) {
      publish({ replanStatus: "error", replanPreview: null,
        replanError: errorMessage(error) + " Request a fresh preview before retrying." });
      await refreshRisks(true);
    } finally { publish({ pending: false }); }
  }
  function dispose() {
    disposed = true; riskRevision++; riskRequest = null;
    snapshot = { ...snapshot, state: createInitialState(), status: "loading", pending: false,
      riskStatus: "loading", riskError: "", riskExpiresAt: null,
      replanPreview: null, replanStatus: "idle", replanError: "", replanMessage: "", replanRange: null,
      generationResult: null, generationRange: null, generationError: "", generating: false,
      error: "", mutationError: "" };
    listeners.clear();
  }
  return {
    dispose, hasSubscribers: () => listeners.size > 0,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load, dispatch, generatePlan, refreshRisks, previewReplan, applyReplan, cancelReplan,
    clearMutationError() { publish({ mutationError: "" }); },
  };
}
