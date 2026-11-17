import { subjectColorStyle } from "../../utils/colors";
import type { CSSProperties } from "react";
import type { StudySession } from "../../types";
import { useAppData } from "../../hooks/useAppData";
import { timeMinutes } from "../../state/appState";
import { statusLabels } from "../../utils/format";

export function StudyBlock({
  session,
  startHour = 16,
  endHour = 21,
}: {
  session: StudySession;
  startHour?: number;
  endHour?: number;
}) {
  const { state, openSession } = useAppData();
  const task = state.tasks.find((item) => item.id === session.task_id);
  const subject = state.subjects.find((item) => item.id === task?.subject_id);
  if (!task || !subject) return null;
  const style = {
    ...subjectColorStyle(subject.color),
    "--session-top":
      ((timeMinutes(session.start_time) - startHour * 60) /
        ((endHour - startHour) * 60)) *
        100 +
      "%",
    "--session-height":
      ((timeMinutes(session.end_time) - timeMinutes(session.start_time)) / ((endHour - startHour) * 60)) * 100 + "%",
  } as CSSProperties;
  return (
    <li className={"study-block tone-" + subject.color + (session.planned_minutes < 60 ? " is-short-session" : "")} style={style}>
      <button
        className="study-block-button"
        onClick={() => openSession({ id: session.id })}
        title={
          subject.name +
          " · " +
          task.title +
          " · " +
          session.start_time +
          "–" +
          session.end_time +
          " · " +
          statusLabels[session.status]
        }
        aria-label={
          task.title +
          ", " +
          session.date +
          ", " +
          session.start_time +
          " to " +
          session.end_time +
          ", " +
          statusLabels[session.status]
        }
      >
        <strong>{subject.name}</strong>
        <span className="block-time">
          {session.start_time}–{session.end_time}
        </span>
        <span className="block-task">{task.title}</span>
        <span className="block-status">{statusLabels[session.status]}</span>
      </button>
    </li>
  );
}
