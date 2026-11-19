import { todayDate, currentWeek } from "../../utils/dates";
import type { CSSProperties } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Coffee, Plus, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppData } from "../../hooks/useAppData";
import { selectDays } from "../../state/selectors";
import { timeMinutes } from "../../state/appState";
import { addDays, mondayOf, weekLabel } from "../../utils/dates";
import { ReplanDialog } from "./ReplanDialog";
import { PlannerFeedback } from "./PlannerFeedback";
import { StudyBlock } from "./StudyBlock";
import { SegmentedControl } from "../common/Controls";
import { calendarDimensions, uiPreferences, useUiPreferences } from "../../state/uiPreferences";

export function WeeklyPlanner({ expanded = false }: { expanded?: boolean }) {
  const { state, openSession, pending, generating, generatePlan, generationResult, generationError, generationRange, previewReplan, replanStatus, replanMessage } = useAppData();
  const [week, setWeek] = useState(currentWeek());
  const preferences = useUiPreferences();
  const dimensions = calendarDimensions[preferences.calendarDensity];
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const days = selectDays(state, week);
  const weekSessions = state.sessions.filter(
    (session) => session.date >= week && session.date < addDays(week, 7),
  );
  const weekAvailability = expanded ? state.availability.filter(window => window.date >= week && window.date < addDays(week, 7)) : [];
  const startHour = Math.min(
    expanded ? 8 : 16,
    ...weekAvailability.map(window => Math.floor(timeMinutes(window.start_time) / 60)),
    ...weekSessions.map((session) =>
      Math.floor(timeMinutes(session.start_time) / 60),
    ),
  );
  const endHour = Math.max(
    expanded ? 22 : 21,
    ...weekAvailability.map(window => Math.ceil(timeMinutes(window.end_time) / 60)),
    ...weekSessions.map((session) =>
      Math.ceil(timeMinutes(session.end_time) / 60),
    ),
  );
  const times = Array.from(
    { length: endHour - startHour + 1 },
    (_, index) => String(startHour + index).padStart(2, "0") + ":00",
  );
  function changeWeek(value: string) {
    const next = mondayOf(value);
    setWeek(next);
    setSelectedDate(next);
  }
  return (
    <section
      className={"panel weekly-panel " + (expanded ? "calendar-expanded" : "")}
      aria-label="Weekly study plan"
    >
      <header className="panel-header">
        <div>
          <h2>{expanded ? "Weekly planner" : "Weekly study plan"}</h2>
          <p>{weekLabel(week)}</p>
        </div>
        <div className="planner-controls">
          {expanded && <span className="week-arrows">
            <button
              type="button"
              disabled={!expanded || generating}
              aria-label="Previous week"
              onClick={() => changeWeek(addDays(week, -7))}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              disabled={!expanded || generating}
              aria-label="Next week"
              onClick={() => changeWeek(addDays(week, 7))}
            >
              <ChevronRight size={14} />
            </button>
          </span>}
          {expanded ? (
            <>
              <button
                className="button calendar-today"
                disabled={generating}
                onClick={() => {
                  setWeek(currentWeek());
                  setSelectedDate(todayDate());
                }}
              >
                Today
              </button>
              <label className="week-picker">
                <span>Week of</span>
                <input
                  type="date"
                  aria-label="Week selector"
                  disabled={generating}
                  value={week}
                  onChange={(event) => {
                    if (event.target.value) changeWeek(event.target.value);
                  }}
                />
              </label>
            </>
          ) : (
            <span className="week-label">This week</span>
          )}
        </div>
      </header>
      {expanded && (
        <div className="calendar-meta">
          <span>Week view · Europe/Budapest · today: {todayDate()}</span>
          <div className="header-actions">
          <button type="button" className="button button-primary" disabled={pending}
            onClick={() => { void generatePlan({ date_from: week, date_to: addDays(week, 6) }); }}>
            {generating ? "Generating study plan…" : "Generate study plan"}
          </button>
          <button type="button" className="button" disabled={pending}
            onClick={() => { void previewReplan({ date_from: week, date_to: addDays(week, 6) }); }}>
            {replanStatus === "previewing" ? "Preparing preview…" : "Replan"}
          </button>
          <button
            disabled={pending}
            className="text-button"
            onClick={() => openSession({ id: "new", date: selectedDate })}
          >
            <Plus size={14} />
            Add study block
          </button>
          </div>
        </div>
      )}
      {expanded && <ReplanDialog />}
      {expanded && <div className="calendar-density"><SegmentedControl label="Calendar density" value={preferences.calendarDensity}
        options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "wide", label: "Wide" }]}
        onChange={calendarDensity => uiPreferences.update({ calendarDensity })} /><span>Day columns scroll horizontally when needed.</span></div>}
      {expanded && replanMessage && <p className="data-notice" role="status">{replanMessage}</p>}
      {expanded && generationRange?.date_from === week && <PlannerFeedback
        result={generationResult} error={generationError} tasks={state.tasks} />}
      {!expanded && !weekSessions.length ? <div className="weekly-empty">
        <CalendarDays size={24} strokeWidth={1.5} aria-hidden="true" />
        <div><h3>A little structure for your week</h3><p>Add availability and reserve your first study block.</p><Link className="text-button" to="/calendar">Open Calendar →</Link></div>
      </div> : <><div
        className="mobile-week-strip"
        role="group"
        aria-label="Choose a study day"
      >
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            aria-pressed={selectedDate === day.date}
            onClick={() => setSelectedDate(day.date)}
          >
            <span>{day.label}</span>
            <strong>{day.number}</strong>
          </button>
        ))}
      </div>
      <div
        className="planner-grid-scroll"
        tabIndex={expanded ? 0 : undefined}
        aria-label={
          expanded
            ? "Weekly calendar, scroll horizontally on smaller tablets"
            : undefined
        }
      >
        <div
          className="week-grid"
          style={
            {
              "--hour-slice": 100 / (endHour - startHour) + "%",
              "--calendar-hours": endHour - startHour,
              "--day-min-width": dimensions.column + "px",
              "--hour-height": dimensions.hour + "px",
            } as CSSProperties
          }
        >
          <div className="time-axis" aria-hidden="true">
            <div className="time-axis-heading" />
            <div className="time-labels">
              {times.map((time, index) => (
                <span
                  key={time}
                  style={{ top: (index / (times.length - 1)) * 100 + "%" }}
                >
                  {time}
                </span>
              ))}
            </div>
          </div>
          {days.map((day) => (
            <section
              key={day.date}
              className={
                "week-day " +
                (day.today ? "is-today " : "") +
                (selectedDate === day.date ? "is-selected" : "")
              }
              aria-label={day.label + " " + day.date}
            >
              <div className="day-heading">
                <span>{day.label}</span>
                <strong>{day.number}</strong>
              </div>
              <ul className="day-blocks">
                {expanded &&
                  state.availability
                    .filter((window) => window.date === day.date)
                    .map((window) => (
                      <li
                        key={window.id}
                        className="availability-window"
                        aria-hidden="true"
                        style={{
                          top:
                            Math.max(
                              0,
                              ((timeMinutes(window.start_time) -
                                startHour * 60) /
                                ((endHour - startHour) * 60)) *
                                100,
                            ) + "%",
                          height:
                            ((timeMinutes(window.end_time) -
                              timeMinutes(window.start_time)) /
                              ((endHour - startHour) * 60)) *
                              100 +
                            "%",
                        }}
                      />
                    ))}
                {state.sessions
                  .filter((session) => session.date === day.date)
                  .sort((a,b)=>a.start_time.localeCompare(b.start_time))
.map((session) => (
                    <StudyBlock
                      key={session.id}
                      session={session}
                      startHour={startHour}
                      endHour={endHour}
                    />
                  ))}
              </ul>
              {!state.sessions.some((session) => session.date === day.date) && (
                <div className="rest-day">
                  <Coffee size={17} aria-hidden="true" />
                  <span>No sessions</span>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      </>}
      <div className="planner-footnote">
        Entered study schedule · Europe/Budapest
        {expanded ? " · shaded windows show entered availability" : ""}
      </div>
    </section>
  );
}
