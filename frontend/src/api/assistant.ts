import type { ApiClient } from "./client";
import { ApiError } from "./client";
import type { ReplanPreview } from "./replanning";
import { mapPreview } from "./replanning";
import type { RiskResponse } from "./risks";

export interface ChatHistory { role: "user" | "assistant"; content: string; }
export interface PendingConfirmation {
  id: string; type: string; summary: Record<string, unknown>; expires_at: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  preview: ReplanPreview | null;
}
export interface AssistantCard { type: string; evaluated_at?: string; preview?: ReplanPreview; tasks?: RiskResponse["tasks"]; }
export interface AssistantResponse {
  message: string; provider: string; model: string; actions: AssistantCard[];
  confirmation: PendingConfirmation | null; metadata: Record<string, unknown>;
}
export interface ActionResult { message: string; planner_changed?: boolean; }
export const assistantApi = (client: ApiClient) => ({
  async message(message: string, history: ChatHistory[]) {
    let value: AssistantResponse;
    try { value = await client.request<AssistantResponse>("/api/assistant/message", "POST", { message, history }, 90_000); }
    catch (error) {
      if (error instanceof ApiError && error.status >= 500) throw new ApiError("AI Assistant is unavailable. Your planner data is unchanged. Try again later or use your planner directly.", error.status);
      throw error;
    }
    return {...value, actions:value.actions.map(card => card.preview ? {...card,preview:mapPreview(card.preview)} : card),
      confirmation:value.confirmation?.preview ? {...value.confirmation,preview:mapPreview(value.confirmation.preview)} : value.confirmation};
  },
  async proposeReplan(preview: ReplanPreview) {
    const value=await client.request<AssistantResponse>("/api/assistant/replan/propose", "POST", {
      ...preview.request,evaluated_at:preview.evaluated_at,fingerprint:preview.fingerprint,plan_digest:preview.plan_digest,
    });
    return {...value,confirmation:value.confirmation?.preview ? {...value.confirmation,preview:mapPreview(value.confirmation.preview)} : value.confirmation};
  },
  confirm(id: string) { return client.request<ActionResult>(`/api/assistant/actions/${encodeURIComponent(id)}/confirm`, "POST", {}); },
  cancel(id: string) { return client.request<ActionResult>(`/api/assistant/actions/${encodeURIComponent(id)}/cancel`, "POST", {}); },
});
