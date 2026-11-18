import type { DeadlineRisk, SubjectRisk } from "../types";

export function currentRisk<T extends DeadlineRisk | SubjectRisk>(risk: T | undefined): risk is T {
  return Boolean(risk && !risk.stale && Date.parse(risk.expires_at) > Date.now());
}
