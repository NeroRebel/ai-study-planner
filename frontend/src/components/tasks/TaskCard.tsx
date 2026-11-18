import { subjectColorStyle } from "../../utils/colors";
import type { Task } from "../../types";
import { useAppData } from "../../hooks/useAppData";
import { ProgressBar } from "../common/ProgressBar";
import { TaskRisk } from "../common/LiveRisk";
import { PriorityBadge } from "../common/PriorityBadge";
import { formatDate, statusLabels } from "../../utils/format";
import { isActive } from "../../state/appState";

export function TaskCard({ task }: { task: Task }) {
  const { state, dispatch, openTask, pending } = useAppData();
  const subject = state.subjects.find((item) => item.id === task.subject_id)!;
  return (
    <article className="task-prototype-card">
      <div className="record-title">
        <input
          type="checkbox"
          checked={task.status === "COMPLETED"}
          disabled={pending || !isActive(task)}
          aria-label={"Complete " + task.title}
          onChange={() => dispatch({ type: "complete-task", id: task.id })}
        />
        <button className="text-button" onClick={() => openTask(task.id)}>
          {task.title}
        </button>
      </div>
      <div className="subject-line">
        <i style={subjectColorStyle(subject.color)} className={"subject-dot tone-" + subject.color} />
        {subject.name}
        <span>Due {formatDate(task.deadline)}</span>
      </div>
      <div className="record-badges">
        <PriorityBadge priority={task.priority} />
        <TaskRisk taskId={task.id} />
        <span>{statusLabels[task.status]}</span>
      </div>
      <div className="record-progress">
        <ProgressBar
          value={task.progress}
          label={task.title + " progress"}
          color={subject.color}
        />
        <span>{task.progress}%</span>
      </div>
      <div className="record-footer">
        <span>{task.remaining_hours.toFixed(1)}h remaining</span>
        <button className="text-button" onClick={() => openTask(task.id)}>
          View details →
        </button>
      </div>
    </article>
  );
}
