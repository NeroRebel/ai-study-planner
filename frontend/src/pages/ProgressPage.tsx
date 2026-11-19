import { todayDate, currentWeek, weekLabel } from "../utils/dates";
import {
  Clock3,
  CheckCheck,
  ChartNoAxesCombined,
  CalendarCheck,
} from "lucide-react";
import { useAppData } from "../hooks/useAppData";
import { PageHeader } from "../components/common/PageHeader";
import { MetricCard } from "../components/common/MetricCard";
import { SubjectProgress } from "../components/dashboard/SubjectProgress";
import { Panel } from "../components/common/Panel";
import { ProgressBar } from "../components/common/ProgressBar";
import { EmptyState } from "../components/common/EmptyState";

import { addDays, hours } from "../utils/dates";

export function ProgressPage() {
  const { state, summary, studyDays } = useAppData();
  const average = state.tasks.length
    ? Math.round(
        state.tasks.reduce((sum, task) => sum + task.progress, 0) /
          state.tasks.length,
      )
    : 0;
  const studyDates = new Set(
    state.sessions
      .filter((session) => session.completed_minutes > 0)
      .map((session) => session.date),
  );
  let date = studyDates.has(todayDate()) ? todayDate() : addDays(todayDate(), -1),
    streak = 0;
  while (studyDates.has(date)) {
    streak++;
    date = addDays(date, -1);
  }
  const active = state.tasks.filter(task => task.status !== "CANCELLED");
  const maximum = Math.max(4, ...studyDays.flatMap((day) => [day.planned_hours, day.completed_hours]));
  return (
    <div className="product-page">
      <PageHeader
        eyebrow="SMALL STEPS, STEADY PROGRESS"
        title="Progress"
        description="Understand your study habits and see your work move forward."
      />
      <div className="metrics-grid">
        <MetricCard
          label="Study time this week"
          value={hours(summary.reportedHours)}
          detail="Reported study time, not estimated effort"
          icon={Clock3}
        />
        <MetricCard
          label="Tasks completed"
          value={summary.completedTasks + " / " + summary.totalTasks}
          detail="Current total across subjects"
          icon={CheckCheck}
        />
        <MetricCard
          label="Average completion rate"
          value={average + "%"}
          detail="Mean of current task progress"
          icon={ChartNoAxesCombined}
        />
        <MetricCard
          label="Current study streak"
          value={streak + " days"}
          detail="Reported consecutive study days"
          icon={CalendarCheck}
        />
      </div>
      <div className="analytics-grid">
        <SubjectProgress />
        <Panel
          title="Planned vs completed study"
          subtitle={weekLabel(currentWeek()) + " · reported time is independent of task effort"}
        >
          <div className="comparison-total">
            <strong>{hours(summary.reportedHours)}</strong>
            <span>reported of {hours(summary.plannedHours)} planned</span>
          </div>
          <div className="comparison-bars">
            <div>
              <span>Planned</span>
              <div>
                <i style={{ width: summary.plannedHours ? "100%" : "0%" }} />
              </div>
              <strong>{hours(summary.plannedHours)}</strong>
            </div>
            <div>
              <span>Reported</span>
              <div>
                <i
                  style={{
                    width:
                      Math.min(
                        100,
                        summary.plannedHours
                          ? (summary.reportedHours / summary.plannedHours) * 100
                          : 0,
                      ) + "%",
                  }}
                />
              </div>
              <strong>{hours(summary.reportedHours)}</strong>
            </div>
          </div>
          <p className="chart-note">
            {hours(summary.availableHours)} of available study time was entered
            for this week.
          </p>
        </Panel>
        <Panel
          title="Weekly study hours"
          subtitle="Monday–Sunday · planned and reported time"
        >
          <div
            className="weekly-hours-chart"
            role="img"
            aria-label={studyDays
              .map(
                (day) =>
                  day.label +
                  ": " +
                  hours(day.planned_hours) +
                  " planned, " +
                  hours(day.completed_hours) +
                  " reported",
              )
              .join("; ")}
          >
            {studyDays.map((day) => (
              <div key={day.date} aria-hidden="true">
                <div className="paired-bars">
                  <i
                    style={{
                      height: (day.planned_hours / maximum) * 100 + "%",
                    }}
                  />
                  <i
                    style={{
                      height: (day.completed_hours / maximum) * 100 + "%",
                    }}
                  />
                </div>
                <strong>{day.label}</strong>
                <span>{hours(day.completed_hours)}</span>
              </div>
            ))}
          </div>
          <div className="chart-key">
            <span>
              <i />
              Planned
            </span>
            <span>
              <i />
              Reported
            </span>
          </div>
        </Panel>
        <Panel title="Current task progress" subtitle="Saved effort progress · no historical estimates">
          {active.length ? <ul className="live-progress-list">
            {active.slice().sort((a,b)=>a.deadline.localeCompare(b.deadline)).map(task=><li key={task.id}>
              <div><strong>{task.title}</strong><span>{task.progress}%</span></div>
              <ProgressBar value={task.progress} label={task.title + " progress"} />
              <small>{hours(task.remaining_hours)} remaining</small>
            </li>)}
          </ul> : <EmptyState title="Your progress starts here" description="Add a task and record progress to see your work move forward." />}
        </Panel>
      </div>
    </div>
  );
}
