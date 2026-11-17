export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Budapest",
  }).format(new Date(value));
}
export const statusLabels = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  PLANNED: "Planned",
  MISSED: "Missed",
  PARTIALLY_COMPLETED: "Partially completed",
};
