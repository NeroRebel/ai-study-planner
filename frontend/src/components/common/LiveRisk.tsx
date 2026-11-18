import { useAppData } from "../../hooks/useAppData";
import type { DeadlineRisk, SubjectRisk } from "../../types";
import { currentRisk } from "../../state/riskSelectors";
import { RiskBadge } from "./RiskBadge";

export function RiskValue({ assessment }: { assessment: DeadlineRisk | SubjectRisk | undefined }) {
  const { riskStatus } = useAppData();
  if (riskStatus === "loading") return <span className="muted">Checking risk…</span>;
  if (riskStatus === "error" || !currentRisk(assessment)) return <span className="muted">Risk unavailable</span>;
  if (!assessment.level) return <span className="muted">{assessment.status === "not_applicable" ? "No active risk" : "Not assessed"}</span>;
  return <span title={assessment.explanation}><RiskBadge level={assessment.level} /></span>;
}
export function TaskRisk({ taskId }: { taskId: string }) {
  const { state } = useAppData();
  return <RiskValue assessment={state.risks.find(item => item.task_id === taskId)} />;
}
export function RiskNotice() {
  const { riskStatus, riskError, refreshRisks, pending } = useAppData();
  if (riskStatus !== "error") return null;
  return <div className="data-notice" role="alert">
    Risk assessment is unavailable. {riskError}{" "}
    <button type="button" className="text-button" disabled={pending}
      onClick={() => { void refreshRisks(); }}>Retry risk assessment</button>
  </div>;
}
