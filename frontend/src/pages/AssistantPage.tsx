import { Link } from "react-router-dom";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { AssistantPanel } from "../components/assistant/AssistantPanel";
import { useAppData } from "../hooks/useAppData";
import { isActive } from "../state/appState";
import { hours } from "../utils/dates";

export function AssistantPage() {
  const { state, summary } = useAppData();
  return (
    <div className="product-page">
      <PageHeader
        eyebrow="A LITTLE GUIDANCE"
        title="AI Assistant"
        description="Explore your study workload through a scripted, state-aware conversation."
      />
      <div className="assistant-workspace">
        <AssistantPanel full />
        <div className="assistant-context">
          <Panel title="Your study context">
            <dl className="context-list">
              <div>
                <dt>Active tasks</dt>
                <dd>{state.tasks.filter(isActive).length}</dd>
              </div>
              <div>
                <dt>Reported this week</dt>
                <dd>{hours(summary.reportedHours)}</dd>
              </div>
              <div>
                <dt>Overall progress</dt>
                <dd>{summary.overallProgress}%</dd>
              </div>
              <div>
                <dt>Study timezone</dt>
                <dd>Europe/Budapest</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="You stay in control">
            <p className="context-copy">
              The assistant reads the same tasks and sessions as the rest of
              this prototype. Suggested actions open the task or calendar
              editor. Nothing is scheduled, moved, or completed by a chat
              response.
            </p>
            <Link className="context-link" to="/calendar">
              Open your calendar →
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
