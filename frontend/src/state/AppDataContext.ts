import { createContext } from "react";
import type { AppAction, AppState } from "./appState";
import type { AssistantMessageData } from "../types";
import type { selectSummary, selectDays } from "./selectors";
export interface SessionDialogRequest { id: string; task_id?: string; date?: string; }
export interface AppDataContextValue {
  state: AppState;
  dispatch: (action: AppAction) => Promise<string | null>;
  status: "loading" | "ready" | "error"; error: string; mutationError: string; pending: boolean;
  retry: () => void; clearMutationError: () => void;
  summary: ReturnType<typeof selectSummary>; studyDays: ReturnType<typeof selectDays>;
  taskDialog: string | null; openTask: (id: string | null) => void;
  sessionDialog: SessionDialogRequest | null; openSession: (request: SessionDialogRequest | null) => void;
  messages: AssistantMessageData[];
  addMessage: (role: AssistantMessageData["role"], content: string) => void;
}
export const AppDataContext = createContext<AppDataContextValue | null>(null);
