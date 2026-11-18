import { AlertTriangle } from "lucide-react";
import type { RiskLevel } from "../../types";
export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`risk-badge risk-${level.toLowerCase()}`}>
      {level === "HIGH" && (
        <AlertTriangle size={11} aria-hidden="true" />
      )}
      {level}
    </span>
  );
}
