import type { DeadlineRisk } from "../types";
// No assessment is assigned to persisted task UUIDs. Future sample snapshots must
// explicitly name their target UUID and stay stale; this is not a risk engine.
export const prototypeRiskAssessments: DeadlineRisk[] = [];
