import { currentRisk } from "../state/riskSelectors";
import type { AppState } from "../state/appState";
import { isActive } from "../state/appState";
import { dueLabel, hours, nextFriday, todayDate } from "../utils/dates";

export const assistantPrompts = [
  "What should I focus on today?",
  "Which deadline is currently most risky?",
  "I did not finish my Database task today.",
  "Can you move my Thesis work to Friday?",
];
// Scripted responses inspect the current persisted entities. No provider, inference, or scheduling runs.
export function mockAssistantReply(state: AppState, text: string) {
  const active = state.tasks.filter(isActive);
  const lower = text.toLowerCase();
  if (lower.includes("risk") || lower.includes("deadline")) {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const risks = state.risks
      .filter((risk) => currentRisk(risk) && risk.level !== null && active.some((task) => task.id === risk.task_id))
      .sort((a, b) => order[a.level!] - order[b.level!]);
    const risk = risks[0],
      task = active.find((task) => task.id === risk?.task_id);
    return task && risk
      ? task.title +
          " has the highest assessed risk: " +
          risk.level +
          ". " +
          dueLabel(task.deadline) +
          ", " +
          hours(task.remaining_hours) +
          " remaining, " +
          task.progress +
          "% complete. " +
          risk.explanation
      : "There are no assessed active tasks. Refresh the risk assessment to try again.";
  }
  if (
    lower.includes("did not") ||
    lower.includes("didn't") ||
    lower.includes("unfinished")
  ) {
    const task = active.find((task) => state.subjects.some(subject => subject.id === task.subject_id && subject.name.toLowerCase().includes("database")));
    return task
      ? "Let's update " +
          task.title +
          ". It currently has " +
          hours(task.remaining_hours) +
          " remaining and " +
          task.progress +
          "% progress. Use Open task to record your actual progress, or Reschedule to edit an existing block. I have not changed any sessions or assumed how much work you completed."
      : "There is no active Databases task. Open Tasks to choose the work you meant.";
  }
  if (
    lower.includes("move") ||
    lower.includes("reschedule") ||
    lower.includes("friday")
  ) {
    const task = active.find((task) => state.subjects.some(subject => subject.id === task.subject_id && subject.name.toLowerCase().includes("thesis")));
    return task
      ? "You can move a block for " +
          task.title +
          " to Friday, " + nextFriday() + " using Reschedule. The server checks availability and conflicts when you save. No block has been moved automatically."
      : "There is no active Thesis task to move. You can create a task from Tasks.";
  }
  if (
    lower.includes("focus") ||
    lower.includes("today") ||
    lower.includes("plan")
  ) {
    const task =
      active.find(task => state.sessions.some(session => session.task_id === task.id && session.date === todayDate() && session.status === "PLANNED")) ?? active[0];
    if (!task)
      return "You have no active tasks. Add a task to start building a manual study plan.";
    const sessions = state.sessions.filter(
      (session) => session.task_id === task.id && session.status === "PLANNED" && session.date >= todayDate(),
    ).sort((a,b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
    return (
      "In this demo, start with " +
      task.title +
      ". " +
      dueLabel(task.deadline) +
      ", " +
      hours(task.remaining_hours) +
      " remaining, " +
      task.progress +
      "% complete. " +
      (sessions.length
        ? "Its next entered block is " +
          sessions[0].date +
          " at " +
          sessions[0].start_time +
          "."
        : "It has no future block entered.") +
      " Open Calendar to review or add blocks. I do not generate or optimize a schedule."
    );
  }
  return "This is a scripted prototype. Try a suggested question about today's focus, deadline risks, unfinished work, or moving a Thesis block. Use the action buttons to make explicit saved edits.";
}
