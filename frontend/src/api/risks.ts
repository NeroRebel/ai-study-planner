import type { ApiClient } from "./client";
import type { DeadlineRisk, SubjectRisk } from "../types";

type ReadTaskRisk = Omit<DeadlineRisk, "evaluated_at" | "expires_at" | "stale">;
type ReadSubjectRisk = Omit<SubjectRisk, "evaluated_at" | "expires_at" | "stale">;
export interface RiskResponse {
  policy_version: string;
  evaluated_at: string;
  expires_at: string;
  timezone: string;
  tasks: ReadTaskRisk[];
  subjects: ReadSubjectRisk[];
  warnings: { code: string; date: string | null; detail: string }[];
}
export const risksApi = (client: ApiClient) => ({
  async read() {
    const result = await client.request<RiskResponse>("/api/risks");
    const freshness = { evaluated_at: result.evaluated_at, expires_at: result.expires_at, stale: false };
    return { ...result,
      tasks: result.tasks.map(task => ({ ...task, ...freshness })),
      subjects: result.subjects.map(subject => ({ ...subject, ...freshness })),
    };
  },
});
