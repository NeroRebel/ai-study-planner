import { Panel } from "../common/Panel";
import { TaskRow } from "../tasks/TaskRow";
import { useAppData } from "../../hooks/useAppData";
import { isActive } from "../../state/appState";
export function TodayPriorities() {
  const { state } = useAppData();
  const ordered = [...state.tasks].filter(isActive)
    .sort((a,b) => a.deadline.localeCompare(b.deadline)).slice(0, 4);
  return (
    <Panel
      title="Today's priorities"
      subtitle="Active work by deadline · choose your focus."
      link="/tasks"
    >
      {!ordered.length && <p className="panel-footnote">No active tasks. Add a task to get started.</p>}
      <ul className="task-list">
        {ordered.map((task) => task && <TaskRow key={task.id} task={task} />)}
      </ul>
      <div className="panel-footnote">
        Complete or open a task · saved to server
      </div>
    </Panel>
  );
}
