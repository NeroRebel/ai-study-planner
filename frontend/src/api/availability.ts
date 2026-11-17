import type { Availability } from "../types";
import type { ApiClient } from "./client";
import { resource } from "./resource";
export type AvailabilityInput = Omit<Availability, "id">;
export function mapAvailability(value: Availability): Availability {
  return { ...value, start_time: value.start_time.slice(0, 5), end_time: value.end_time.slice(0, 5) };
}
export const availabilityApi = (client: ApiClient) =>
  resource<Availability, AvailabilityInput>(client, "/api/availability", mapAvailability);
