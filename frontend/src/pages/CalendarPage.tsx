import { useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays } from "lucide-react";
import { useAppData } from "../hooks/useAppData";
import { PageHeader } from "../components/common/PageHeader";
import { WeeklyPlanner } from "../components/calendar/WeeklyPlanner";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { EmptyState } from "../components/common/EmptyState";
import { todayDate } from "../utils/dates";

export function CalendarPage() {
  const { state, dispatch, pending } = useAppData();
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState(todayDate);
  const [start, setStart] = useState("09:00"), [end, setEnd] = useState("12:00");
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (end <= start) { setError("End time must be after start time."); return; }
    const result = await dispatch({ type: "save-availability",
      window: { id: editing ?? "new", date, start_time: start, end_time: end } });
    if (result) { setError(result); return; }
    setEditing(null); setError("");
  }
  return <div className="product-page calendar-page">
    <PageHeader eyebrow="YOUR STUDY WEEK" title="Calendar"
      description="Make space for focused work, one study block at a time."
      action={<div className="header-actions"><button className="button"
        onClick={() => { setError(""); setAvailabilityOpen(true); }}>
        <CalendarDays size={15} />Availability</button></div>} />
    <WeeklyPlanner expanded />
    <p className="page-note">Generate a plan for the displayed week or add blocks manually. Existing sessions are preserved; progress changes only when you report work.</p>
    {availabilityOpen && <Modal title="Study availability" onClose={() => setAvailabilityOpen(false)} wide>
      <p className="muted">Enter dated study windows before reserving blocks. These are available periods, not scheduled study time.</p>
      <form onSubmit={save} className="editor-form availability-form" aria-busy={pending}>
        <div className="form-grid">
          <FormField label="Availability date"><input type="date" required value={date}
            onChange={event => setDate(event.target.value)} /></FormField>
          <FormField label="Start time"><input type="time" required value={start}
            onChange={event => setStart(event.target.value)} /></FormField>
          <FormField label="End time"><input type="time" required value={end}
            onChange={event => setEnd(event.target.value)} /></FormField>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          {editing && <button className="button" type="button" onClick={() => { setEditing(null); setError(""); }}>Cancel edit</button>}
          <button className="button button-primary" disabled={pending} type="submit">{editing ? "Save availability" : "Add availability"}</button>
        </div>
      </form>
      {!state.availability.length && <EmptyState title="No availability yet" description="Add a window to make room for a study block." />}
      <ul className="detail-list">
        {[...state.availability].sort((a,b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).map(window =>
          <li key={window.id}><strong>{window.date}</strong><span>{window.start_time}–{window.end_time}</span>
            <button className="text-button" disabled={pending} onClick={() => {
              setEditing(window.id); setDate(window.date); setStart(window.start_time); setEnd(window.end_time); setError("");
            }}>Edit</button>
            <button className="text-button" disabled={pending} onClick={async () => {
              const result = await dispatch({ type: "delete-availability", id: window.id });
              if (result) setError(result); else { setError(""); if (editing === window.id) setEditing(null); }
            }}>Delete</button>
          </li>)}
      </ul>
      <div className="form-actions"><button className="button" onClick={() => setAvailabilityOpen(false)}>Done</button></div>
    </Modal>}
  </div>;
}
