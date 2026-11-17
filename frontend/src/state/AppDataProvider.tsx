import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createApi } from "../api";
import type { AssistantMessageData } from "../types";
import { AppDataContext } from "./AppDataContext";
import type { SessionDialogRequest } from "./AppDataContext";
import { createAppDataStore } from "./appDataStore";
import { selectSummary, selectDays } from "./selectors";
import { todayDate } from "../utils/dates";

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAppDataStore(createApi(import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000")));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { state } = snapshot;
  const [today, setToday] = useState(todayDate);
  const [taskDialog, setTaskDialog] = useState<string | null>(null);
  const [sessionDialog, setSessionDialog] = useState<SessionDialogRequest | null>(null);
  const [messages, setMessages] = useState<AssistantMessageData[]>([{
    id: "welcome", role: "assistant",
    content: "Hi! I am your scripted Study Assistant. My replies use your loaded tasks and sessions. Suggested actions open normal editors; only saving a valid form changes your data. No live AI is connected.",
  }]);
  useEffect(() => {
    void store.load();
    const timer = setInterval(() => setToday(todayDate()), 60_000);
    return () => clearInterval(timer);
  }, [store]);
  const summary = useMemo(() => selectSummary(state, today), [state, today]);
  const studyDays = useMemo(() => selectDays(state, undefined, today), [state, today]);
  // Stable functions prevent route effects from repeatedly opening dialogs.
  const actions = useMemo(() => ({
    openTask: (id: string | null) => { store.clearMutationError(); setTaskDialog(id); },
    openSession: (request: SessionDialogRequest | null) => { store.clearMutationError(); setSessionDialog(request); },
    retry: () => { void store.load(); },
  }), [store]);
  function addMessage(role: AssistantMessageData["role"], content: string) {
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role, content }]);
  }
  return <AppDataContext.Provider value={{ ...snapshot, ...actions,
    dispatch: store.dispatch, clearMutationError: store.clearMutationError,
    summary, studyDays, taskDialog, sessionDialog, messages, addMessage,
  }}>{children}</AppDataContext.Provider>;
}
