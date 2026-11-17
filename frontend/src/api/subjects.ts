import type { Subject } from "../types";
import type { ApiClient } from "./client";
import { resource } from "./resource";
export type SubjectInput = Pick<Subject, "name" | "description" | "color">;
export const subjectsApi = (client: ApiClient) =>
  resource<Subject, SubjectInput>(client, "/api/subjects", value => ({ ...value }));
