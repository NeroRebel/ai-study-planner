import type { Subject, Task, StudySession, Availability, DeadlineRisk, SubjectRisk, Priority,
  Difficulty, TaskStatus, StudySessionStatus } from "../types";
import type { SubjectInput } from "../api/subjects";

export interface Preferences {
  // Account display context. Device presentation defaults live in uiPreferences.
  name: string;
}
export interface AppState {
  subjects: Subject[]; tasks: Task[]; sessions: StudySession[]; availability: Availability[];
  risks: DeadlineRisk[]; subjectRisks: SubjectRisk[]; preferences: Preferences;
}
export interface TaskInput {
  title: string; description: string; subject_id: string; deadline: string;
  estimated_hours: number; progress: number; priority: Priority; difficulty: Difficulty; status: TaskStatus;
}
export interface SessionInput {
  task_id: string; date: string; start_time: string; end_time: string;
  status: StudySessionStatus; completed_minutes: number;
  task_remaining_hours?: number; confirm_no_progress?: boolean;
}
export type AppAction =
  | { type: "save-task"; id: string; input: TaskInput }
  | { type: "complete-task"; id: string }
  | { type: "reopen-task"; id: string }
  | { type: "delete-task"; id: string }
  | { type: "save-subject"; id?: string; input: SubjectInput }
  | { type: "delete-subject"; id: string }
  | { type: "save-session"; id: string; input: SessionInput }
  | { type: "delete-session"; id: string }
  | { type: "save-availability"; window: Availability }
  | { type: "delete-availability"; id: string }
  | { type: "preferences"; value: Preferences };
export function createInitialState(): AppState {
  return { subjects: [], tasks: [], sessions: [], availability: [],
    risks: [], subjectRisks: [],
    preferences: { name: "Student" } };
}
export const isActive = (task: Task) => task.status !== "COMPLETED" && task.status !== "CANCELLED";
export function timeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
// Form hints only. Domain, capacity, lifecycle and progress rules are owned by FastAPI.
export function validateTask(input: TaskInput): string | null {
  if (!input.title.trim()) return "Enter a task title.";
  if (!Number.isFinite(Date.parse(input.deadline))) return "Enter a valid local deadline.";
  if (!Number.isFinite(input.estimated_hours) || input.estimated_hours <= 0) return "Enter positive estimated hours.";
  if (!Number.isInteger(input.progress) || input.progress < 0 || input.progress > 100) return "Progress must be between 0 and 100.";
  return null;
}
