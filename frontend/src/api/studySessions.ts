import type { StudySession } from "../types";
import type { SessionInput } from "../state/appState";
import type { ApiClient } from "./client";
import { resource } from "./resource";
export function mapStudySession(value: StudySession): StudySession {
  return { ...value, start_time: value.start_time.slice(0, 5), end_time: value.end_time.slice(0, 5) };
}
export const studySessionsApi = (client: ApiClient) =>
  resource<StudySession, SessionInput>(client, "/api/study-sessions", mapStudySession);
