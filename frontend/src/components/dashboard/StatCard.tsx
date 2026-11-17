import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ProgressBar } from "../common/ProgressBar";
import type { SubjectColor } from "../../types";

export function StatCard({
  label,
  value,
  suffix,
  detail,
  icon: Icon,
  color,
  to,
  progress,
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  icon: LucideIcon;
  color: SubjectColor;
  to: string;
  progress?: number;
}) {
  return (
    <Link to={to} className="stat-card">
      <span className={"stat-icon tone-" + color}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <div className="stat-value">
          {value}
          <span>{suffix}</span>
        </div>
        <div className="stat-detail">{detail}</div>
        {progress !== undefined && (
          <ProgressBar value={progress} label={label} color={color} />
        )}
      </div>
    </Link>
  );
}
