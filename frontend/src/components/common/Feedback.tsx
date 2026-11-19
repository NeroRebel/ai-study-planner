import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";

export function Feedback({ children, tone = "info", action }: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
  action?: ReactNode;
}) {
  const Icon = tone === "success" ? CircleCheck : tone === "info" ? Info : TriangleAlert;
  return <div className={`feedback feedback-${tone}`} role={tone === "error" || tone === "warning" ? "alert" : "status"}>
    <Icon size={18} aria-hidden="true" />
    <div className="feedback-content">{children}</div>
    {action && <div className="feedback-action">{action}</div>}
  </div>;
}
