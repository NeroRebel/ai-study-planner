import { useAppData } from "../../hooks/useAppData";
import { hours } from "../../utils/dates";
import { Panel } from "../common/Panel";

export function StudyLoad() {
  const { studyDays, summary } = useAppData();
  const maximum = Math.max(4, ...studyDays.map((day) => day.planned_hours));
  return (
    <Panel title="Study load (hours)" className="study-load-panel">
      <div
        className="load-chart"
        role="img"
        aria-label={studyDays
          .map(
            (day) =>
              day.label +
              ": " +
              day.planned_hours +
              " hours planned of " +
              day.available_hours +
              " hours available",
          )
          .join("; ")}
      >
        <div className="load-axis" aria-hidden="true">
          {[maximum, maximum * 0.75, maximum * 0.5, maximum * 0.25, 0].map(
            (value) => (
              <span key={value}>{value}</span>
            ),
          )}
        </div>
        <div className="load-bars" aria-hidden="true">
          {studyDays.map((day) => (
            <div
              key={day.date}
              className={"load-day " + (day.today ? "today" : "")}
            >
              <div className="load-bar-area">
                <div
                  className="load-planned"
                  style={{ height: (day.planned_hours / maximum) * 100 + "%" }}
                />
              </div>
              <span>{day.label}</span>
              <small>{hours(day.planned_hours)}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="load-summary">
        {hours(summary.plannedHours)} planned{" "}
        <span>of {hours(summary.availableHours)} available</span>
      </div>
      <p className="load-note">
        {hours(summary.unallocatedHours)} work not reserved in future sessions.
      </p>
    </Panel>
  );
}
