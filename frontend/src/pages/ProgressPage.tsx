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
import { completionHistory } from "../data/prototypeHistoricalAnalytics";

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
  const history = [
    ...completionHistory,
    { label: "Current", completion: summary.overallProgress },
  ];
  const maximum = Math.max(4, ...studyDays.map((day) => day.planned_hours));
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
                <i style={{ width: "100%" }} />
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
        <Panel
          title="Task completion trend"
          subtitle="Effort-weighted completion snapshots, not weekly completion counts"
        >
          <div className="trend-chart">
            <svg
              viewBox="0 0 400 170"
              role="img"
              aria-label={history
                .map((item) => item.label + ": " + item.completion + "%")
                .join("; ")}
            >
              {[25, 50, 75, 100].map((value) => (
                <line
                  key={value}
                  x1="20"
                  x2="380"
                  y1={150 - value * 1.25}
                  y2={150 - value * 1.25}
                  stroke="#eef0f3"
                />
              ))}
              <polyline
                points={history
                  .map(
                    (item, index) =>
                      30 + index * 110 + "," + (150 - item.completion * 1.25),
                  )
                  .join(" ")}
                fill="none"
                stroke="#b69a70"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {history.map((item, index) => (
                <g key={item.label}>
                  <circle
                    cx={30 + index * 110}
                    cy={150 - item.completion * 1.25}
                    r="4"
                    fill="#b69a70"
                  />
                  <text
                    x={30 + index * 110}
                    y={138 - item.completion * 1.25}
                    textAnchor="middle"
                    fill="#7b6d55"
                    fontSize="11"
                  >
                    {item.completion}%
                  </text>
                  <text
                    x={30 + index * 110}
                    y="168"
                    textAnchor="middle"
                    fill="#8c929d"
                    fontSize="10"
                  >
                    {item.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <p className="chart-note">
            Earlier weeks are historical fixtures. The latest point reflects
            your saved task data; the earlier points are not persisted history.
          </p>
        </Panel>
      </div>
    </div>
  );
}
