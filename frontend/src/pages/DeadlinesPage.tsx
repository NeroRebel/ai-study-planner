import { subjectColorStyle } from "../utils/colors";
import { useState } from "react";
import { Flag, TriangleAlert, Clock3, CalendarDays } from "lucide-react";
import { useAppData } from "../hooks/useAppData";
import { isActive } from "../state/appState";
import { PageHeader } from "../components/common/PageHeader";
import { MetricCard } from "../components/common/MetricCard";
import { TaskRisk } from "../components/common/LiveRisk";
import { currentRisk } from "../state/riskSelectors";
import { ProgressBar } from "../components/common/ProgressBar";
import { EmptyState } from "../components/common/EmptyState";
import { dueLabel, hours } from "../utils/dates";
import { formatDate, formatDeadlineTime } from "../utils/format";

export function DeadlinesPage() {
  const { state, summary, openTask, riskStatus } = useAppData();
  const riskReady = riskStatus === "ready" && state.risks.every(currentRisk);
  const [filter, setFilter] = useState("ALL");
  const active = state.tasks.filter(isActive);
  const tasks = [...active]
    .filter(
      (task) =>
        filter === "ALL" ||
        state.risks.find((risk) => currentRisk(risk) && risk.task_id === task.id)?.level === filter,
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const risky = active.filter((task) =>
    state.risks.some(
      (risk) =>
        risk.task_id === task.id &&
        currentRisk(risk) && risk.level === "HIGH",
    ),
  ).length;
  return (
    <div className="product-page">
      <PageHeader
        eyebrow="STAY A STEP AHEAD"
        title="Deadlines"
        description="See what's coming, how much work remains, and where attention is needed."
      />
      <div className="metrics-grid">
        <MetricCard
          label="Upcoming deadlines"
          value={String(summary.upcomingDeadlines)}
          detail="Next 7 days"
          icon={Flag}
        />
        <MetricCard
          label="High-risk deadlines"
          value={riskReady ? String(risky) : riskStatus === "loading" ? "Checking…" : "Unavailable"}
          detail="Live backend assessments"
          icon={TriangleAlert}
        />
        <MetricCard
          label="Hours required"
          value={hours(
            active.reduce((sum, task) => sum + task.remaining_hours, 0),
          )}
          detail="Remaining across all active tasks"
          icon={Clock3}
        />
        <MetricCard
          label="Available study hours"
          value={hours(summary.availableHours)}
          detail="Entered capacity this week"
          icon={CalendarDays}
        />
      </div>
      <div className="section-heading">
        <h2>Upcoming assignments</h2>
        <label className="inline-filter">
          Risk level
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="ALL">All levels</option>
            {["LOW", "MEDIUM", "HIGH"].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="sample-disclaimer">
        Risk is assessed from remaining work, planned sessions and free availability.
        Capacity margins may be shared between tasks and must not be added together.
      </p>
      <div className="deadline-cards">
        {tasks.map((task) => {
          const subject = state.subjects.find(
            (item) => item.id === task.subject_id,
          )!;
          const risk = state.risks.find((item) => currentRisk(item) && item.task_id === task.id);
          return (
            <article
              key={task.id}
              className={
                "deadline-detail-card " +
                (risk?.level ? "deadline-" + risk.level.toLowerCase() : "")
              }
            >
              <div className="deadline-card-heading">
                <div>
                  <span className="subject-line">
                    <i style={subjectColorStyle(subject.color)} className={"subject-dot tone-" + subject.color} />
                    {subject.name}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => openTask(task.id)}
                  >
                    {task.title}
                  </button>
                </div>
                <TaskRisk taskId={task.id} />
              </div>
              <dl className="deadline-facts">
                <div>
                  <dt>Deadline</dt>
                  <dd>
                    {formatDate(task.deadline)} · {formatDeadlineTime(task.deadline)}
                    <small>{dueLabel(task.deadline)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Required</dt>
                  <dd>{hours(task.remaining_hours)}</dd>
                </div>
                <div>
                  <dt>Usable before deadline</dt>
                  <dd>
                    {risk ? hours(risk.capacity_minutes / 60) : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Progress</dt>
                  <dd>{task.progress}%</dd>
                </div>
              </dl>
              <ProgressBar
                value={task.progress}
                label={task.title + " progress"}
                color={subject.color}
              />
              <div className="record-footer">
                <span>
                  {risk?.explanation ?? "Risk assessment is unavailable."}
                </span>
                <button
                  className="text-button"
                  onClick={() => openTask(task.id)}
                >
                  Open task →
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!tasks.length && (
        <EmptyState
          title="No matching deadlines"
          description="Try another risk level or add an active task."
        />
      )}
    </div>
  );
}
