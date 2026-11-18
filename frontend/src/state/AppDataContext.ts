import type { DataSnapshot } from "./appDataStore";
import type { GeneratePlanInput } from "../api/planner";
import { createContext } from "react";
import type { AppAction, AppState } from "./appState";
import type { AssistantMessageData } from "../types";
import type { selectSummary, selectDays } from "./selectors";
export interface SessionDialogRequest { id: string; task_id?: string; date?: string; }
export interface AppDataContextValue extends Pick<DataSnapshot, "generating" | "generationResult" | "generationError" | "generationRange" | "replanStatus" | "replanPreview" | "replanError" | "replanMessage" | "replanRange" | "riskStatus" | "riskError" | "riskExpiresAt"> {
  previewReplan: (input: GeneratePlanInput) => Promise<void>;
  applyReplan: () => Promise<void>;
  cancelReplan: () => void;
  refreshRisks: () => Promise<void>;
  generatePlan: (input: GeneratePlanInput) => Promise<void>;
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
