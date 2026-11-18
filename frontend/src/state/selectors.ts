import { currentRisk } from "./riskSelectors";
import type { AppState } from "./appState";
import { isActive, timeMinutes } from "./appState";
import { addDays, todayDate, mondayOf, calendarDate } from "../utils/dates";

export function selectSubjectProgress(
  state: AppState,
  subjectId?: string,
) {
  const tasks = state.tasks.filter(
    (task) =>
      task.status !== "CANCELLED" &&
      (!subjectId || task.subject_id === subjectId),
  );
  const estimate = tasks.reduce((sum, task) => sum + task.estimated_hours, 0);
  const remaining = tasks.reduce((sum, task) => sum + task.remaining_hours, 0);
  return {
    progress: estimate
      ? Math.round(((estimate - remaining) / estimate) * 100)
      : 0,
    remaining_hours: remaining,
  };
}
export function selectSummary(state: AppState, today = todayDate()) {
  const week = mondayOf(today);

  const weekSessions = state.sessions.filter(
    (session) =>
      session.date >= week && session.date < addDays(week, 7),
  );
  const availableHours =
    state.availability
      .filter(
        (window) =>
          window.date >= week && window.date < addDays(week, 7),
      )
      .reduce(
        (sum, window) =>
          sum + timeMinutes(window.end_time) - timeMinutes(window.start_time),
        0,
      ) / 60;
  const active = state.tasks.filter(isActive);
  const upcoming = active.filter(
    (task) =>
      calendarDate(task.deadline) >= today &&
      calendarDate(task.deadline) < addDays(today, 7),
  );
  return {
    completedTasks: state.tasks.filter((task) => task.status === "COMPLETED")
      .length,
    totalTasks: state.tasks.length,
    reportedHours:
      weekSessions.reduce(
        (sum, session) => sum + session.completed_minutes,
        0,
      ) / 60,
    plannedHours:
      weekSessions.reduce((sum, session) => sum + session.planned_minutes, 0) /
      60,
    availableHours,
    upcomingDeadlines: upcoming.length,
    highRiskDeadlines: upcoming.filter((task) =>
      state.risks.some(
        (risk) =>
          risk.task_id === task.id && currentRisk(risk) &&
          risk.level === "HIGH",
      ),
    ).length,
    overallProgress: selectSubjectProgress(state).progress,
    unallocatedHours: Math.max(
      0,
      active.reduce((sum, task) => sum + task.remaining_hours, 0) -
        state.sessions
          .filter(
            (session) =>
              session.status === "PLANNED" && session.date >= today,
          )
          .reduce((sum, session) => sum + session.planned_minutes, 0) /
          60,
    ),
  };
}
export function selectDays(state: AppState, start = mondayOf(todayDate()), today = todayDate()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
      number: date.slice(8),
      today: date === today,
      planned_hours:
        state.sessions
          .filter((session) => session.date === date)
          .reduce((sum, session) => sum + session.planned_minutes, 0) / 60,
      completed_hours:
        state.sessions
          .filter((session) => session.date === date)
          .reduce((sum, session) => sum + session.completed_minutes, 0) / 60,
      available_hours:
        state.availability
          .filter((window) => window.date === date)
          .reduce(
            (sum, window) =>
              sum +
              timeMinutes(window.end_time) -
              timeMinutes(window.start_time),
            0,
          ) / 60,
    };
  });
}
