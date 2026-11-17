import { useAppData } from "../../hooks/useAppData";
import { isActive } from "../../state/appState";
import { Panel } from "../common/Panel";
import { DeadlineRow } from "./DeadlineRow";
export function UpcomingDeadlines({ full = false }: { full?: boolean }) {
  const { state } = useAppData();
  const tasks = state.tasks
    .filter(isActive)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  return (
    <Panel
      title="Upcoming deadlines"
      link={full ? undefined : "/deadlines"}
      className="deadlines-panel"
    >
      <div className="table-scroll">
        <table>
          <caption className="sr-only">
            Current task deadlines and sample risk assessments
          </caption>
          <thead>
            <tr>
              <th scope="col">Assignment</th>
              <th scope="col">Subject</th>
              <th scope="col">Due date</th>
              <th scope="col">Priority</th>
              <th scope="col">Risk</th>
            </tr>
          </thead>
          <tbody>
            {(full ? tasks : tasks.slice(0, 4)).map((task) => (
              <DeadlineRow key={task.id} task={task} />
            ))}
          </tbody>
        </table>
        {!tasks.length && (
          <p className="panel-footnote">
            No active deadlines. You're all caught up.
          </p>
        )}
      </div>
    </Panel>
  );
}
