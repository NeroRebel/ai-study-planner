import { assistantApi } from "./assistant";
import { replanningApi } from "./replanning";
import { plannerApi } from "./planner";
import { risksApi } from "./risks";
import type { ApiAuth } from "./client";
import { createApiClient } from "./client";
import { subjectsApi } from "./subjects";
import { tasksApi } from "./tasks";
import { availabilityApi } from "./availability";
import { studySessionsApi } from "./studySessions";
export function createApi(baseUrl: string, auth?: ApiAuth) {
  const client = createApiClient(baseUrl, auth);
  return { assistant: assistantApi(client), subjects: subjectsApi(client), tasks: tasksApi(client),
    availability: availabilityApi(client), sessions: studySessionsApi(client), planner: plannerApi(client), replanning: replanningApi(client), risks: risksApi(client) };
}
export type AppApi = ReturnType<typeof createApi>;
