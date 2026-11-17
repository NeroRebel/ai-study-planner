import type { Task } from "../types";
import type { TaskInput } from "../state/appState";
import type { ApiClient } from "./client";
import { resource } from "./resource";
export function mapTask(value: Task): Task {
  return { ...value, deadline: new Date(value.deadline).toISOString() };
}
export const tasksApi = (client: ApiClient) =>
  resource<Task, TaskInput>(client, "/api/tasks", mapTask);
