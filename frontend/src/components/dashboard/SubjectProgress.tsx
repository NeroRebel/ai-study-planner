import { subjectColorStyle } from "../../utils/colors";
import { useAppData } from "../../hooks/useAppData";
import { selectSubjectProgress } from "../../state/selectors";
import { ProgressBar } from "../common/ProgressBar";
import { Panel } from "../common/Panel";
import { hours } from "../../utils/dates";
export function SubjectProgress() {
  const { state } = useAppData();
  return (
    <Panel
      title="Subject progress"
      link="/progress"
      className="subject-progress-panel"
    >
      {!state.subjects.length && <p className="panel-footnote">No subjects yet. Add a subject to see progress.</p>}
      <div className="subject-progress-list">
        {state.subjects.map((subject) => {
          const item = selectSubjectProgress(state, subject.id);
          return (
            <div
              key={subject.id}
              className="subject-progress"
              title={hours(item.remaining_hours) + " remaining"}
            >
              <span>
                <i style={subjectColorStyle(subject.color)} className={"subject-dot tone-" + subject.color} />
                {subject.name}
              </span>
              <ProgressBar
                value={item.progress}
                label={subject.name + " progress"}
                color={subject.color}
              />
              <strong>{item.progress}%</strong>
              <span className="sr-only">
                {hours(item.remaining_hours)} remaining
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
