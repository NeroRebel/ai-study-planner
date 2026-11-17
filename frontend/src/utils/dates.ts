export const TIMEZONE = "Europe/Budapest";
export function addDays(date: string, amount: number) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function mondayOf(date: string) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function dayDistance(date: string, from = todayDate()) {
  return Math.round(
    (Date.parse(calendarDate(date) + "T12:00:00Z") -
      Date.parse(from + "T12:00:00Z")) /
      86400000,
  );
}
export function dueLabel(date: string) {
  const days = dayDistance(date);
  return days < 0
    ? Math.abs(days) + " days overdue"
    : days === 0
      ? "Due today"
      : days === 1
        ? "1 day remaining"
        : days + " days remaining";
}
export function localInput(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return (
    get("year") +
    "-" +
    get("month") +
    "-" +
    get("day") +
    "T" +
    get("hour") +
    ":" +
    get("minute")
  );
}
export function inputToISO(local: string) {
  const [date, time] = local.split("T");
  if (!date || !time) return "";
  const target = Date.parse(local + "Z");
  let guess = target;
  for (let count = 0; count < 3; count++) {
    const formatted = localInput(new Date(guess).toISOString());
    guess += target - Date.parse(formatted + "Z");
  }
  const iso = new Date(guess).toISOString();
  if (localInput(iso) !== local) return "";
  // Reject repeated DST wall times instead of guessing one of two instants.
  const matches = [-120, -60, 0, 60, 120].filter(minutes =>
    localInput(new Date(guess + minutes * 60000).toISOString()) === local);
  return matches.length === 1 ? iso : "";
}
export function weekLabel(start: string) {
  const format = (date: string) =>
    new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(date + "T12:00:00Z"));
  return (
    format(start) + " – " + format(addDays(start, 6)) + ", " + start.slice(0, 4)
  );
}
export const hours = (value: number) => Number(value.toFixed(1)) + "h";

export function calendarDate(value: string) {
  return value.includes("T") ? localInput(value).slice(0, 10) : value;
}
export function todayDate() { return calendarDate(new Date().toISOString()); }
export function currentWeek() { return mondayOf(todayDate()); }
export function nextFriday() { return addDays(todayDate(), (5 - new Date(todayDate() + "T12:00:00Z").getUTCDay() + 7) % 7); }

// A minute-resolution editor must not truncate an unchanged server instant.
export function serializeDeadline(local: string, original?: string) {
  return original && localInput(original) === local ? original : inputToISO(local);
}
