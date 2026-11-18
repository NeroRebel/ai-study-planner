import {
  BookOpen,
  CheckCheck,
  Clock3,
  TrendingUp,
  ArrowRight,
  Search,
  Sun,
} from "lucide-react";
import { Link } from "react-router-dom";
import { StatCard } from "../components/dashboard/StatCard";
import { TodayPriorities } from "../components/dashboard/TodayPriorities";
import { WeeklyPlanner } from "../components/calendar/WeeklyPlanner";
import { UpcomingDeadlines } from "../components/dashboard/UpcomingDeadlines";
import { SubjectProgress } from "../components/dashboard/SubjectProgress";
import { StudyLoad } from "../components/dashboard/StudyLoad";
import { AssistantPanel } from "../components/assistant/AssistantPanel";
import { currentWeek, weekLabel, TIMEZONE } from "../utils/dates";
import { useAppData } from "../hooks/useAppData";
import { currentRisk } from "../state/riskSelectors";
import { hours } from "../utils/dates";

export function DashboardPage() {
  const { state, summary: stats, riskStatus } = useAppData();
  const riskReady = riskStatus === "ready" && state.risks.every(currentRisk);
  const highCount = state.risks.filter(risk => currentRisk(risk) && risk.level === "HIGH").length;
  return (
    <div className="dashboard-layout">
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1>
              Good morning, {state.preferences.name.split(" ")[0]}{" "}
              <Sun size={25} aria-hidden="true" />
            </h1>
            <p>
              Here's your study overview.{" "}
              <span>
                {riskReady ? `${highCount} high-risk deadlines need attention.` : riskStatus === "loading" ? "Checking deadline risks…" : "Risk assessment is unavailable."}
              </span>
            </p>
          </div>
          <div className="dashboard-header-tools">
            <span className="demo-badge">Saved workspace</span>
            <label className="dashboard-search">
              <Search size={16} aria-hidden="true" />
              <input
                disabled
                aria-label="Search (unavailable in preview)"
                placeholder="Search tasks, subjects..."
              />
            </label>
          </div>
        </header>
        <div className="stat-grid">
          <StatCard
            label="Tasks completed"
            value={String(stats.completedTasks)}
            suffix={" / " + stats.totalTasks}
            detail="Total across your subjects"
            icon={CheckCheck}
            color="gold"
            to="/tasks"
          />
          <StatCard
            label="Study time (this week)"
            value={hours(stats.reportedHours)}
            suffix={" / " + hours(stats.availableHours)}
            detail="Reported / available hours"
            icon={Clock3}
            color="purple"
            to="/progress"
          />
          <StatCard
            label="Upcoming deadlines"
            value={String(stats.upcomingDeadlines)}
            detail={riskReady ? `Next 7 days · ${stats.highRiskDeadlines} high risk` : "Next 7 days · risk unavailable"}
            icon={BookOpen}
            color="blue"
            to="/deadlines"
          />
          <StatCard
            label="Overall progress"
            value={state.tasks.some(task => task.status !== "CANCELLED") ? stats.overallProgress + "%" : "No tasks"}
            detail="Across all subjects"
            icon={TrendingUp}
            color="gold"
            to="/progress"
            progress={stats.overallProgress}
          />
        </div>
        <div className="dashboard-planning-grid">
          <WeeklyPlanner />
          <div className="dashboard-insights">
            <StudyLoad />
            <SubjectProgress />
          </div>
        </div>
        <div className="dashboard-bottom-grid">
          <TodayPriorities />
          <UpcomingDeadlines />
        </div>
        <div className="dashboard-snapshot">
          {weekLabel(currentWeek())} · {TIMEZONE} · Persisted manual sessions
        </div>
        <div className="mobile-shortcuts">
          <span>Explore your workspace</span>
          {[
            ["Tasks", "/tasks"],
            ["Deadlines", "/deadlines"],
            ["Progress", "/progress"],
            ["Settings", "/settings"],
          ].map(([label, to]) => (
            <Link key={to} to={to}>
              {label}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
      <div className="dashboard-assistant">
        <AssistantPanel />
      </div>
    </div>
  );
}
