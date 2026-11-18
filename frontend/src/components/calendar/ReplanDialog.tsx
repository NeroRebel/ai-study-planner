import { useAppData } from "../../hooks/useAppData";
import { Modal } from "../common/Modal";
import type { ReplanPreview } from "../../api/replanning";
import type { Task } from "../../types";

const nameOf = (tasks: Task[], id: string) => tasks.find(task => task.id === id)?.title ?? "Task no longer available";
export function ReplanDetails({ preview, tasks }: { preview: ReplanPreview; tasks: Task[] }) {
  const count = preview.sessions_moved.length + preview.sessions_created.length + preview.sessions_removed.length;
  return <>
    <p>{count ? `${count} session changes proposed.` : preview.unscheduled_minutes ? "No session changes can resolve the remaining shortfall." : preview.warnings.length ? "No automatic changes proposed. Review the warnings below." : "No changes needed. Your current plan is valid."}</p>
    <div className="detail-summary">
      <span>Moved: {preview.sessions_moved.length}</span><span>Added: {preview.sessions_created.length}</span>
      <span>Removed: {preview.sessions_removed.length}</span><span>Kept: {preview.sessions_kept.length}</span>
    </div>
    <p className="form-note">Manual blocks, history and ongoing sessions are preserved. Only future planner-managed blocks in {preview.request.date_from}–{preview.request.date_to} can move.</p>
    {preview.sessions_moved.length > 0 && <><h3 className="detail-heading">Moved study blocks</h3><ul className="detail-list">
      {preview.sessions_moved.map(move => <li key={move.session_id}><strong>{nameOf(tasks, move.after.task_id)}</strong>
        <span>{move.before.date} {move.before.start_time}–{move.before.end_time} → {move.after.date} {move.after.start_time}–{move.after.end_time}</span></li>)}
    </ul></>}
    {([['Added', preview.sessions_created], ['Removed', preview.sessions_removed]] as const).map(([label, sessions]) => sessions.length > 0 &&
      <section key={label}><h3 className="detail-heading">{label} study blocks</h3><ul className="detail-list">
        {sessions.map(session => <li key={session.id}><strong>{nameOf(tasks, session.task_id)}</strong>
          <span>{session.date} {session.start_time}–{session.end_time} · {session.planned_minutes} min</span></li>)}
      </ul></section>)}
    {preview.affected_tasks.length > 0 && <><h3 className="detail-heading">Affected tasks & deadline risk</h3><ul className="detail-list">
      {preview.affected_tasks.map(id => {
        const before = preview.risk_before.tasks.find(row => row.task_id === id);
        const after = preview.risk_after.tasks.find(row => row.task_id === id);
        return <li key={id}><strong>{nameOf(tasks, id)}</strong><span>
          {before?.level ?? "No active risk"} → {after?.level ?? "No active risk"}
          {before?.level === after?.level ? " · No risk change" : ""}
        </span><small className="muted">{after?.explanation}</small></li>;
      })}
    </ul></>}
    {preview.unscheduled_minutes > 0 && <div className="data-notice" role="alert">
      {preview.unscheduled_minutes} minutes could not be scheduled in this planning range before the deadlines.
      <ul>{preview.tasks.filter(task => task.unscheduled_minutes).map(task => <li key={task.task_id}>
        {nameOf(tasks, task.task_id)}: {((task.unscheduled_minutes ?? 0) / 60).toFixed(1)}h unscheduled
      </li>)}</ul>
    </div>}
    {preview.warnings.map((warning, index) => <p className="form-note" key={warning.code + index}>{warning.detail}</p>)}
  </>;
}

export function ReplanDialog() {
  const { state, replanStatus, replanPreview, replanError, replanRange, previewReplan, applyReplan, cancelReplan } = useAppData();
  if (!["previewing", "ready", "applying", "error"].includes(replanStatus)) return null;
  const busy = replanStatus === "previewing" || replanStatus === "applying";
  const count = replanPreview ? replanPreview.sessions_created.length + replanPreview.sessions_moved.length + replanPreview.sessions_removed.length : 0;
  return <Modal title="Replan study schedule" wide onClose={() => { if (!busy) cancelReplan(); }}>
    <div aria-busy={busy}>
      {replanStatus === "previewing" && <p role="status">Preparing a safe replanning preview…</p>}
      {replanPreview && <ReplanDetails preview={replanPreview} tasks={state.tasks} />}
      {replanError && <p role="alert" className="form-error">{replanError}</p>}
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={cancelReplan}>Cancel</button>
        {replanError && replanRange && <button type="button" className="button" disabled={busy}
          onClick={() => { void previewReplan(replanRange); }}>Request fresh preview</button>}
        {replanPreview && <button type="button" className="button button-primary" disabled={busy || !count}
          onClick={() => { void applyReplan(); }}>{replanStatus === "applying" ? "Applying changes…" : "Apply changes"}</button>}
      </div>
    </div>
  </Modal>;
}
