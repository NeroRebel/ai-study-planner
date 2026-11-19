import type { GeneratePlanResult } from "../../api/planner";
import type { Task } from "../../types";
import { Feedback } from "../common/Feedback";
const reasons: Record<string, string> = {
  DEADLINE_PASSED: "Deadline has passed; update it before scheduling.",
  NO_ENTERED_AVAILABILITY: "No study availability entered for this interval.",
  INSUFFICIENT_FREE_TIME: "Not enough free time in this interval before the deadline.",
  EXISTING_RESERVATION_CONFLICT: "Review conflicting existing reservations first.",
  INVALID_TASK_DATA: "Task data needs correction before it can be scheduled.",
  GENERATION_LIMIT: "The session limit was reached.",
};
export function PlannerFeedback({ result, error, tasks }: {
  result: GeneratePlanResult | null; error: string; tasks: Task[];
}) {
  if (error) return <Feedback tone="error">{error}</Feedback>;
  if (!result) return null;
  const invalid = result.tasks.filter(task => task.reasons.includes("INVALID_TASK_DATA"));
  const incomplete = result.tasks_partially_scheduled + result.tasks_unscheduled + invalid.length;
  const unresolved = result.tasks.filter(task =>
    task.outcome === "PARTIALLY_SCHEDULED" || task.outcome === "UNSCHEDULED" || invalid.includes(task));
  return <Feedback tone={incomplete || result.warnings.length ? "warning" : "success"}>
    <strong>Study plan generated: {result.created_count} {result.created_count === 1 ? "session" : "sessions"} created.</strong>
    {incomplete > 0 ? <p>{incomplete} {incomplete === 1 ? "task could" : "tasks could"} not be fully scheduled.
      {" "}{result.unscheduled_minutes} minutes remain unscheduled{invalid.length ? "; some task effort is unknown" : ""}.</p>
      : result.created_count === 0 && <p>No additional blocks are needed for the current task data.</p>}
    {unresolved.length > 0 && <details><summary>Unscheduled work</summary><ul>
      {unresolved.map(task => <li key={task.task_id}>
        <strong>{tasks.find(item => item.id === task.task_id)?.title ?? "Task"}</strong>
        {": "}{task.unscheduled_minutes === null ? "Unknown effort" : task.unscheduled_minutes + " minutes"}
        {" · "}{task.reasons.map(reason => reasons[reason] ?? "Review task constraints.").join(" ")}
      </li>)}
    </ul></details>}
    {result.warnings.map((warning, index) => <p key={warning.code + String(index)}>
      {warning.date ? warning.date + ": " : ""}{warning.detail}
    </p>)}
  </Feedback>;
}
