import { todayDate } from "../../utils/dates";
import { useContext, useState } from "react";
import { AuthContext } from "../../auth/AuthContext";
import type { FormEvent } from "react";
import { useAppData } from "../../hooks/useAppData";
import { RequestError } from "../common/RequestError";
import { Modal } from "../common/Modal";
import { FormField } from "../common/FormField";
import { isActive } from "../../state/appState";
import type { SessionInput } from "../../state/appState";
import type { SessionDialogRequest } from "../../state/AppDataContext";
import type { StudySessionStatus } from "../../types";
import { statusLabels } from "../../utils/format";
import { useUiPreferences } from "../../state/uiPreferences";

export function SessionDialog({ request }: { request: SessionDialogRequest }) {
  const { state, dispatch, openSession, openTask, pending } = useAppData();
  const preferences = useUiPreferences();
  const auth = useContext(AuthContext);
  const sessionMinutes = auth?.profile?.preferred_session_minutes ?? preferences.sessionMinutes;
  const session = state.sessions.find((item) => item.id === request.id);
  const active = state.tasks.filter(isActive);
  const [form, setForm] = useState<SessionInput>(
    session
      ? { ...session }
      : {
          task_id: request.task_id ?? "",
          date: request.date ?? todayDate(),
          start_time: "17:00",
          end_time: String(17 + Math.floor(sessionMinutes / 60)).padStart(2, "0") + ":" + String(sessionMinutes % 60).padStart(2, "0"),
          status: "PLANNED",
          completed_minutes: 0,
        },
  );
  const [error, setError] = useState("");
  function update<K extends keyof SessionInput>(
    key: K,
    value: SessionInput[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await dispatch({
      type: "save-session",
      id: session?.id ?? "new",
      input: { ...form, task_remaining_hours: form.completed_minutes > 0 ? form.task_remaining_hours : undefined,
        confirm_no_progress: form.completed_minutes > 0 && form.confirm_no_progress },
    });
    if (result) { setError(result); return; }
    openSession(null);
  }
  const historicalClosed =
    session &&
    state.tasks.some((task) => task.id === session.task_id && !isActive(task));
  return (
    <Modal
      title={session ? "Study block details" : "Add study block"}
      onClose={() => openSession(null)}
    >
      {session?.origin === "SCHEDULER" && <p className="form-note">Planner-managed block. Changing its task, date or time makes it manual and protects your placement from replanning.</p>}
      {historicalClosed ? (
        <>
          <div className="detail-summary">
            <strong>
              {state.tasks.find((task) => task.id === session.task_id)?.title}
            </strong>
            <span>
              {session.date} · {session.start_time}–{session.end_time}
            </span>
            <span>
              {statusLabels[session.status]} · {session.completed_minutes}{" "}
              minutes reported
            </span>
          </div>
          <p className="form-note">
            This is a historical record for a closed task. Its study time is
            preserved.
          </p>
          <div className="form-actions">
            <button
              className="button"
              onClick={() => {
                openSession(null);
                openTask(session.task_id);
              }}
            >
              Open task
            </button>
            <button
              className="button button-primary"
              onClick={() => openSession(null)}
            >
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={save} className="editor-form" aria-busy={pending}>
          <FormField label="Task">
            <select
              value={form.task_id}
              required
              onChange={(event) => update("task_id", event.target.value)}
            >
              <option value="">Choose an active task</option>
              {active.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Study date">
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </FormField>
          <div className="form-grid">
            <FormField label="Start time">
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(event) => update("start_time", event.target.value)}
              />
            </FormField>
            <FormField label="End time">
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(event) => update("end_time", event.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Session status">
            <select
              value={form.status}
              onChange={(event) =>
                update("status", event.target.value as StudySessionStatus)
              }
            >
              {["PLANNED", "COMPLETED", "MISSED", "PARTIALLY_COMPLETED"].map(
                (value) => (
                  <option key={value} value={value}>
                    {statusLabels[value as StudySessionStatus]}
                  </option>
                ),
              )}
            </select>
          </FormField>
          <FormField
            label="Reported study minutes"
            hint="Time spent does not automatically change task progress."
          >
            <input
              type="number"
              min="0"
              step="1"
              required
              value={form.completed_minutes}
              onChange={(event) =>
                update("completed_minutes", event.target.valueAsNumber || 0)
              }
            />
          </FormField>
          {form.completed_minutes > 0 && <>
            <FormField label="Task remaining hours" hint="Enter revised remaining effort, or confirm below that it is unchanged.">
              <input type="number" min="0" step="0.01" value={form.task_remaining_hours ?? ""}
                disabled={form.confirm_no_progress}
                onChange={event => setForm(previous => ({ ...previous,
                  task_remaining_hours: event.target.value === "" ? undefined : event.target.valueAsNumber }))} />
            </FormField>
            <label className="checkbox-field"><input type="checkbox" checked={form.confirm_no_progress ?? false}
              onChange={event => setForm(previous => ({ ...previous, confirm_no_progress: event.target.checked,
                task_remaining_hours: undefined }))} /> No change to task remaining effort</label>
          </>}
          <p className="form-note">
            Blocks must fit an availability window, avoid overlaps, and respect
            remaining effort and deadlines. Availability is edited from
            Calendar. This is a manual change, not automatic planning.
          </p>
<RequestError message={error} />
          <div className="form-actions">
            {session && <button type="button" className="text-button" disabled={pending}
              onClick={async () => {
                if (!window.confirm("Delete this study session? Its reported study time will be removed. Task effort will not change.")) return;
                const result = await dispatch({ type: "delete-session", id: session.id });
                if (result) setError(result); else openSession(null);
              }}>Delete block</button>}
            {session && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  openSession(null);
                  openTask(session.task_id);
                }}
              >
                Update task progress
              </button>
            )}
            <button
              className="button"
              type="button"
              onClick={() => openSession(null)}
            >
              Cancel
            </button>
            <button disabled={pending} className="button button-primary" type="submit">
              {session ? "Save block" : "Create block"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
