import { subjectColorStyle } from "../../utils/colors";
import { BookOpen, ArrowUpRight } from "lucide-react";
import type { Subject } from "../../types";
import { useAppData } from "../../hooks/useAppData";
import { selectSubjectProgress } from "../../state/selectors";
import { isActive } from "../../state/appState";
import { ProgressBar } from "../common/ProgressBar";
import { formatDate } from "../../utils/format";
import { hours } from "../../utils/dates";

export function SubjectCard({
  subject,
  onOpen,
}: {
  subject: Subject;
  onOpen: () => void;
}) {
  const { state } = useAppData();
  const tasks = state.tasks.filter((task) => task.subject_id === subject.id);
  const active = tasks.filter(isActive);
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const ids = new Set(tasks.map((task) => task.id));
  const planned =
    state.sessions
      .filter((session) => ids.has(session.task_id))
      .reduce((sum, session) => sum + session.planned_minutes, 0) / 60;
  const next = [...active].sort((a, b) =>
    a.deadline.localeCompare(b.deadline),
  )[0];
  const progress = selectSubjectProgress(state, subject.id).progress;
  return (
    <button
      style={subjectColorStyle(subject.color)} className={"subject-overview-card tone-" + subject.color}
      onClick={onOpen}
    >
      <span className="subject-card-heading">
        <span className="subject-card-icon">
          <BookOpen size={21} />
        </span>
        <ArrowUpRight size={17} />
      </span>
      <h2>{subject.name}</h2>
      <p>{subject.description || "Your university subject."}</p>
      <span className="subject-metrics">
        <span>
          <strong>{active.length}</strong>Active tasks
        </span>
        <span>
          <strong>{completed}</strong>Completed
        </span>
        <span>
          <strong>{hours(planned)}</strong>Planned
        </span>
      </span>
      <span className="subject-progress-heading">
        <span>Subject progress</span>
        <strong>{progress}%</strong>
      </span>
      <ProgressBar
        value={progress}
        label={subject.name + " progress"}
        color={subject.color}
      />
      <span className="subject-next">
        Next deadline{" "}
        <strong>{next ? formatDate(next.deadline) : "All caught up"}</strong>
      </span>
    </button>
  );
}
