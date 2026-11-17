import type { SubjectColor } from "../../types";
export function ProgressBar({
  value,
  label,
  color = "gold",
}: {
  value: number;
  label: string;
  color?: SubjectColor;
}) {
  return (
    <div
      className={`progress-bar tone-${color?.startsWith("#") ? "gold" : color ?? "gold"}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: value + "%", ...(color?.startsWith("#") ? { background: color } : {}) }} />
    </div>
  );
}
