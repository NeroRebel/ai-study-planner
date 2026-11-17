import type { ApiClient } from "./client";
import type { StudySession } from "../types";
import { mapStudySession } from "./studySessions";

export interface GeneratePlanInput {
  date_from: string;
  date_to: string;
  task_ids?: string[];
}
export interface TaskAllocation {
  task_id: string;
  outcome: "FULLY_SCHEDULED" | "PARTIALLY_SCHEDULED" | "UNSCHEDULED" | "SKIPPED";
  remaining_minutes: number | null;
  existing_reserved_minutes: number;
  generated_minutes: number;
  unscheduled_minutes: number | null;
  reasons: string[];
}
export interface GeneratePlanResult extends GeneratePlanInput {
  algorithm_version: string;
  evaluated_at: string;
  timezone: string;
  sessions_created: StudySession[];
  created_count: number;
  tasks_fully_scheduled: number;
  tasks_partially_scheduled: number;
  tasks_unscheduled: number;
  tasks_skipped: number;
  unscheduled_minutes: number;
  tasks: TaskAllocation[];
  warnings: { code: string; date: string | null; detail: string }[];
}
export const plannerApi = (client: ApiClient) => ({
  async generate(input: GeneratePlanInput): Promise<GeneratePlanResult> {
    const result = await client.request<GeneratePlanResult>("/api/planner/generate", "POST", input);
    return { ...result, sessions_created: result.sessions_created.map(mapStudySession) };
  },
});
