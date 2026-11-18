import type { ApiClient } from "./client";
import type { GeneratePlanInput, TaskAllocation } from "./planner";
import type { RiskResponse } from "./risks";
import type { StudySession } from "../types";
import { mapStudySession } from "./studySessions";

export interface ReplanMove {
  session_id: string; old_start: string; old_end: string; new_start: string; new_end: string;
  before: StudySession; after: StudySession;
}
export interface ReplanPreview {
  policy_version: string; request: GeneratePlanInput;
  evaluated_at: string; expires_at: string; fingerprint: string; plan_digest: string;
  sessions_kept: StudySession[]; sessions_created: StudySession[];
  sessions_moved: ReplanMove[]; sessions_removed: StudySession[];
  affected_tasks: string[]; tasks: TaskAllocation[]; unscheduled_minutes: number;
  tasks_fully_scheduled: number; tasks_partially_scheduled: number; tasks_unscheduled: number;
  reasons: string[]; warnings: {code: string; date: string | null; detail: string}[];
  risk_before: RiskResponse; risk_after: RiskResponse; applied: boolean;
}
export function mapPreview(value: ReplanPreview): ReplanPreview {
  return {...value, sessions_kept: value.sessions_kept.map(mapStudySession),
    sessions_created: value.sessions_created.map(mapStudySession), sessions_removed: value.sessions_removed.map(mapStudySession),
    sessions_moved: value.sessions_moved.map(move => ({...move, before:mapStudySession(move.before), after:mapStudySession(move.after)}))};
}
export const replanningApi = (client: ApiClient) => ({
  async preview(input: GeneratePlanInput) {
    return mapPreview(await client.request<ReplanPreview>("/api/planner/replan/preview", "POST", input));
  },
  async apply(preview: ReplanPreview) {
    return mapPreview(await client.request<ReplanPreview>("/api/planner/replan/apply", "POST", {
      ...preview.request, evaluated_at:preview.evaluated_at, fingerprint:preview.fingerprint, plan_digest:preview.plan_digest,
    }));
  },
});
