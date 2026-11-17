export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type StudySessionStatus =
  "PLANNED" | "COMPLETED" | "MISSED" | "PARTIALLY_COMPLETED";
export type SubjectColor = "blue" | "gold" | "purple" | "green" | `#${string}` | null;
export interface Subject {
  id: string;
  name: string;
  description: string;
  color: SubjectColor;
  created_at: string;
  updated_at: string;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  subject_id: string;
  deadline: string;
  estimated_hours: number;
  remaining_hours: number;
  priority: Priority;
  difficulty: Difficulty;
  progress: number;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}
export interface Availability {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
}
export interface StudySession {
  id: string;
  task_id: string;
  date: string;
  start_time: string;
  end_time: string;
  planned_minutes: number;
  completed_minutes: number;
  status: StudySessionStatus;
}
export interface DeadlinePreview {
  task_id: string;
  risk: RiskLevel;
  due_label: string;
}
export interface AssistantMessageData {
  id: string;
  role: "assistant" | "user";
  content: string;
}
export interface StudyDay {
  date: string;
  label: string;
  number: string;
  today?: boolean;
  planned_hours: number;
  available_hours: number;
}

export type SessionStatus = StudySessionStatus;
export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export interface DeadlineRisk {
  task_id: string;
  level: RiskLevel;
  available_hours: number;
  assessed_at: string;
  stale: boolean;
}
