import type { GeneratePlanInput, GeneratePlanResult } from "../api/planner";
import type { AppApi } from "../api";
import { errorMessage } from "../api/client";
import { createInitialState } from "./appState";
import type { AppAction, AppState } from "./appState";

export interface DataSnapshot {
  generating: boolean; generationResult: GeneratePlanResult | null; generationError: string;
  generationRange: GeneratePlanInput | null;
  state: AppState; status: "loading" | "ready" | "error";
  error: string; mutationError: string; pending: boolean;
}
export function createAppDataStore(api: AppApi) {
  let snapshot: DataSnapshot = { generating: false, generationResult: null, generationError: "", generationRange: null, state: createInitialState(), status: "loading", error: "", mutationError: "", pending: false };
  const listeners = new Set<() => void>();
  let loading: Promise<void> | null = null;
  function publish(change: Partial<DataSnapshot>) {
    snapshot = { ...snapshot, ...change };
    listeners.forEach(listener => listener());
  }
  async function load() {
    if (loading) return loading;
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
    return loading;
  }
  // Forms may hold ORM/read fields. Explicitly whitelist the API write contract.
  function taskPayload(input: Extract<AppAction, { type: "save-task" }>["input"]) {
    const { title, description, subject_id, deadline, estimated_hours, progress, priority, difficulty, status } = input;
    return { title, description, subject_id, deadline, estimated_hours, progress, priority, difficulty, status };
  }
  async function dispatch(action: AppAction): Promise<string | null> {
    if (action.type === "preferences") {
      publish({ state: { ...snapshot.state, preferences: action.value } });
      return null;
    }
    if (snapshot.pending || loading) return "Please wait for the current request to finish.";
    if (snapshot.status !== "ready") return "Load your workspace before making changes.";
    publish({ pending: true, mutationError: "" });
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
      publish({ state: { ...snapshot.state, risks: snapshot.state.risks.map(risk => ({ ...risk, stale: true })) } });
      await load();
      return null; // Write succeeded even if refresh failed; don't invite duplicate POSTs.
    } catch (error) {
      const message = errorMessage(error);
      publish({ mutationError: message });
      return message;
    } finally { publish({ pending: false }); }
  }
  async function generatePlan(input: GeneratePlanInput): Promise<void> {
    if (snapshot.pending || loading || snapshot.status !== "ready") return;
    publish({ pending: true, generating: true, generationResult: null, generationError: "", generationRange: input });
    try {
      const result = await api.planner.generate(input);
      publish({ generationResult: result, state: { ...snapshot.state,
        risks: snapshot.state.risks.map(risk => ({ ...risk, stale: true })) } });
      await load(); // Reuse the normal shared refresh, including the committed sessions.
    } catch (error) {
      publish({ generationError: errorMessage(error) });
    } finally { publish({ pending: false, generating: false }); }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load, dispatch, generatePlan,
    clearMutationError() { publish({ mutationError: "" }); },
  };
}
