import { subjectColorStyle } from "../../utils/colors";
import type { Task } from "../../types";
import { useAppData } from "../../hooks/useAppData";
import { RiskBadge } from "../common/RiskBadge";
import { statusLabels } from "../../utils/format";
import { isActive } from "../../state/appState";
import { hours } from "../../utils/dates";
export function TaskRow({ task }: { task: Task }) {
  const { state, dispatch, openTask, pending } = useAppData();
  const subject = state.subjects.find((item) => item.id === task.subject_id)!;
  const risk = isActive(task)
    ? state.risks.find((item) => item.task_id === task.id)
    : undefined;
  return (
    <li className="task-row">
      <input
        type="checkbox"
        checked={task.status === "COMPLETED"}
        disabled={pending || !isActive(task)}
        aria-label={"Complete " + task.title}
        onChange={() => dispatch({ type: "complete-task", id: task.id })}
      />
      <div className="task-info">
        <strong>
          <button className="text-button" onClick={() => openTask(task.id)}>
            {task.title}
          </button>
        </strong>
        <div className="task-meta">
          <span style={subjectColorStyle(subject.color)} className={"subject-dot tone-" + subject.color} />
          <span>{task.description || subject.name}</span>
        </div>
      </div>
      <div className="task-trailing">
        {risk && <RiskBadge level={risk.level} />}
        <span className="task-status">
          {risk?.stale ? "Needs reassessment" : statusLabels[task.status]}
        </span>
      </div>
      <span className="task-duration">
        {hours(task.remaining_hours)}
        <span className="sr-only"> remaining</span>
      </span>
    </li>
  );
}
