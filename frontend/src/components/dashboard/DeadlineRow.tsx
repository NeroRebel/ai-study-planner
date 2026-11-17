import { subjectColorStyle } from "../../utils/colors";
import type { Task } from "../../types";
import { useAppData } from "../../hooks/useAppData";
import { formatDate } from "../../utils/format";
import { dueLabel } from "../../utils/dates";
import { RiskBadge } from "../common/RiskBadge";
import { PriorityBadge } from "../common/PriorityBadge";
export function DeadlineRow({ task }: { task: Task }) {
  const { state, openTask } = useAppData();
  const subject = state.subjects.find((item) => item.id === task.subject_id)!;
  const risk = state.risks.find((item) => item.task_id === task.id);
  return (
    <tr>
      <td>
        <button className="text-button" onClick={() => openTask(task.id)}>
          {task.title}
        </button>
      </td>
      <td>
        <span className="deadline-subject">
          <i style={subjectColorStyle(subject.color)} className={"subject-dot tone-" + subject.color} />
          {subject.name}
        </span>
      </td>
      <td>
        <strong className="due-date">{formatDate(task.deadline)}</strong>
        <span className="table-subtitle">{dueLabel(task.deadline)}</span>
      </td>
      <td>
        <PriorityBadge priority={task.priority} />
      </td>
      <td>
        {risk ? (
          <>
            <RiskBadge level={risk.level} />
            {risk.stale && (
              <span className="table-subtitle">Sample · needs review</span>
            )}
          </>
        ) : (
          <span className="table-subtitle">Not assessed</span>
        )}
      </td>
    </tr>
  );
}
