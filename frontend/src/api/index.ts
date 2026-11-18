import { plannerApi } from "./planner";
import { risksApi } from "./risks";
import { createApiClient } from "./client";
import { subjectsApi } from "./subjects";
import { tasksApi } from "./tasks";
import { availabilityApi } from "./availability";
import { studySessionsApi } from "./studySessions";
export function createApi(baseUrl: string) {
  const client = createApiClient(baseUrl);
  return { subjects: subjectsApi(client), tasks: tasksApi(client),
    availability: availabilityApi(client), sessions: studySessionsApi(client), planner: plannerApi(client), risks: risksApi(client) };
}
export type AppApi = ReturnType<typeof createApi>;
