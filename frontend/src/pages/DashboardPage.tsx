import {
  BookOpen,
  CheckCheck,
  Clock3,
  TrendingUp,
  ArrowRight,
  Sun,
  PanelRightOpen,
} from "lucide-react";
import { useRef, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { uiPreferences, useUiPreferences } from "../state/uiPreferences";
import { Link } from "react-router-dom";
import { StatCard } from "../components/dashboard/StatCard";
import { TodayPriorities } from "../components/dashboard/TodayPriorities";
import { WeeklyPlanner } from "../components/calendar/WeeklyPlanner";
import { UpcomingDeadlines } from "../components/dashboard/UpcomingDeadlines";
import { SubjectProgress } from "../components/dashboard/SubjectProgress";
import { StudyLoad } from "../components/dashboard/StudyLoad";
import { DashboardAssistant } from "../components/assistant/DashboardAssistant";
import { currentWeek, weekLabel, TIMEZONE } from "../utils/dates";
import { useAppData } from "../hooks/useAppData";
import { currentRisk } from "../state/riskSelectors";
import { hours } from "../utils/dates";

export function DashboardPage() {
  const { state, summary: stats, riskStatus } = useAppData();
  const { assistantHidden } = useUiPreferences();
  const docked = useMediaQuery("(min-width: 1440px)");
  const [overlay, setOverlay] = useState({ open: false, docked });
  // A layout change closes the temporary overlay; returning to tablet must not reopen it.
  if (overlay.docked !== docked) setOverlay({ open: false, docked });
  const overlayOpen = overlay.open && !docked;
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const riskReady = riskStatus === "ready" && state.risks.every(currentRisk);
  const highCount = state.risks.filter(risk => currentRisk(risk) && risk.level === "HIGH").length;
  return (
    <div className={"dashboard-layout " + (docked && !assistantHidden ? "has-assistant-dock" : "")}>
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
                {riskReady ? highCount ? `${highCount} high-risk deadlines need attention.` : "No high-risk deadlines right now." : riskStatus === "loading" ? "Checking deadline risks…" : "Risk assessment is unavailable."}
              </span>
            </p>
          </div>
          <div className="dashboard-header-tools">
            <Link className="button button-secondary button-compact" to="/calendar">View calendar</Link>
            {(!docked || assistantHidden) && <button ref={assistantTrigger} type="button" className="button button-subtle button-compact dashboard-assistant-toggle" aria-label="Show assistant panel" aria-expanded={!docked && overlayOpen}
              onClick={() => docked ? uiPreferences.update({ assistantHidden: false }) : setOverlay({ open: true, docked })}>
              <PanelRightOpen size={16} strokeWidth={1.7} aria-hidden="true" />Assistant
            </button>}
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
          {weekLabel(currentWeek())} · {TIMEZONE} · Saved study sessions
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
      <DashboardAssistant docked={docked} hidden={assistantHidden} overlayOpen={overlayOpen}
        onClose={() => { setOverlay({ open: false, docked }); if (docked) uiPreferences.update({ assistantHidden: true }); requestAnimationFrame(() => assistantTrigger.current?.focus()); }} />
    </div>
  );
}
