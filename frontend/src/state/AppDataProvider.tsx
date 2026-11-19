import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { AppApi } from "../api";
import { createApi } from "../api";
import { createAssistantStore } from "./assistantStore";
import { createWorkspaceStore } from "./workspaceStore";
import { AppDataContext } from "./AppDataContext";
import type { SessionDialogRequest } from "./AppDataContext";
import { createAppDataStore } from "./appDataStore";
import { selectSummary, selectDays } from "./selectors";
import { todayDate } from "../utils/dates";

export function AppDataProvider({ children, api, displayName }: { children: ReactNode; api?: AppApi; displayName?: string }) {
  const [client] = useState(() => api ?? createApi(import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"));
  const [store] = useState(() => createAppDataStore(client, displayName || "Student"));
  const [assistantStore] = useState(() => createAssistantStore(client.assistant, store.refreshAfterExternalMutation));
  const [workspaceStore] = useState(() => createWorkspaceStore(client.workspace, store.refreshAfterExternalMutation));
  const workspace = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot);
  const assistant = useSyncExternalStore(assistantStore.subscribe, assistantStore.getSnapshot);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { state } = snapshot;
  const [today, setToday] = useState(todayDate);
  const [taskDialog, setTaskDialog] = useState<string | null>(null);
  const [sessionDialog, setSessionDialog] = useState<SessionDialogRequest | null>(null);
  useEffect(() => {
    void store.load();
    const timer = setInterval(() => {
      setToday(todayDate());
      const current = store.getSnapshot();
      if (current.riskStatus === "error" || (current.riskExpiresAt && Date.parse(current.riskExpiresAt) <= Date.now()))
        void store.refreshRisks();
    }, 60_000);
    return () => {
      clearInterval(timer);
      // StrictMode immediately resubscribes the same mounted store. An actual
      // account-boundary unmount clears it and rejects late response publishes.
      queueMicrotask(() => { if (!store.hasSubscribers()) { store.dispose(); assistantStore.dispose(); workspaceStore.dispose(); } });
    };
  }, [store, assistantStore, workspaceStore]);
  useEffect(() => {
    if (snapshot.riskStatus !== "ready" || !snapshot.riskExpiresAt) return;
    const delay = Math.max(1000, Math.min(60_000, Date.parse(snapshot.riskExpiresAt) - Date.now() + 50));
    const timer = setTimeout(() => { void store.refreshRisks(); }, delay);
    return () => clearTimeout(timer);
  }, [store, snapshot.riskStatus, snapshot.riskExpiresAt]);
  useEffect(() => { if (displayName) void store.dispatch({type:"preferences",value:{...store.getSnapshot().state.preferences,name:displayName}}); }, [store,displayName]);
  const summary = useMemo(() => selectSummary(state, today), [state, today]);
  const studyDays = useMemo(() => selectDays(state, undefined, today), [state, today]);
  // Stable functions prevent route effects from repeatedly opening dialogs.
  const actions = useMemo(() => ({
    openTask: (id: string | null) => { store.clearMutationError(); setTaskDialog(id); },
    openSession: (request: SessionDialogRequest | null) => { store.clearMutationError(); setSessionDialog(request); },
    retry: () => { void store.load(); },
  }), [store]);
  return <AppDataContext.Provider value={{ ...snapshot, ...actions,
    previewReplan: store.previewReplan, applyReplan: store.applyReplan, cancelReplan: store.cancelReplan,
    refreshRisks: store.refreshRisks, generatePlan: store.generatePlan, dispatch: store.dispatch, clearMutationError: store.clearMutationError,
    summary, studyDays, taskDialog, sessionDialog, assistant, assistantStore, workspace, workspaceStore,
  }}>{children}</AppDataContext.Provider>;
}
