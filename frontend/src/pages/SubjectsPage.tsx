import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "../hooks/useAppData";
import { PageHeader } from "../components/common/PageHeader";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { SubjectCard } from "../components/subjects/SubjectCard";
import { ProgressBar } from "../components/common/ProgressBar";
import { EmptyState } from "../components/common/EmptyState";
import { selectSubjectProgress } from "../state/selectors";
import { isActive } from "../state/appState";
import { formatDate, statusLabels } from "../utils/format";
import type { SubjectColor } from "../types";

export function SubjectsPage() {
  const { state, dispatch, openTask, openSession, pending } = useAppData();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""),
    [description, setDescription] = useState("");
  const [color, setColor] = useState<SubjectColor>("gold");
  const [error, setError] = useState("");
  const subject = state.subjects.find((item) => item.id === selected);
  const tasks = subject
    ? state.tasks.filter((task) => task.subject_id === subject.id)
    : [];
  const sessions = state.sessions.filter((session) =>
    tasks.some((task) => task.id === session.task_id),
  );
  const active = tasks
    .filter(isActive)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a subject name.");
      return;
    }
    const result = await dispatch({ type: "save-subject", id: selected ?? undefined,
      input: { name: name.trim(), description, color } });
    if (result) { setError(result); return; }
    setSelected(null);
    setAdding(false);
    setName("");
    setDescription("");
    setError("");
  }
  return (
    <div className="product-page">
      <PageHeader
        eyebrow="YOUR SEMESTER"
        title="Subjects"
        description="A clear overview of every subject, task, and deadline."
        action={
          <button
            className="button button-primary"
            onClick={() => { setSelected(null); setName(""); setDescription(""); setError(""); setAdding(true); }}
          >
            <Plus size={16} />
            Add Subject
          </button>
        }
      />
      <div className="subjects-overview">
        {state.subjects.map((item) => (
          <SubjectCard
            key={item.id}
            subject={item}
            onOpen={() => setSelected(item.id)}
          />
        ))}
      </div>
      {!state.subjects.length && <EmptyState title="No subjects yet" description="Add your first university subject to get started." />}
      {subject && !adding && (
        <Modal title={subject.name} onClose={() => setSelected(null)} wide>
          <p className="muted">{subject.description}</p>
          <div className="subject-detail-progress">
            <strong>
              {selectSubjectProgress(state, subject.id).progress}% complete
            </strong>
            <ProgressBar
              value={selectSubjectProgress(state, subject.id).progress}
              label={subject.name + " progress"}
              color={subject.color}
            />
          </div>
          <h3 className="detail-heading">Active tasks & upcoming deadlines</h3>
          {active.length ? (
            <ul className="detail-list">
              {active.map((task) => (
                <li key={task.id}>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelected(null);
                      openTask(task.id);
                    }}
                  >
                    {task.title}
                  </button>
                  <span>
                    {formatDate(task.deadline)} ·{" "}
                    {task.remaining_hours.toFixed(1)}h left
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No active tasks"
              description="Add a task to start planning this subject."
            />
          )}
          <h3 className="detail-heading">Planned study sessions</h3>
          {sessions.length ? (
            <ul className="detail-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelected(null);
                      openSession({ id: session.id });
                    }}
                  >
                    {formatDate(session.date + "T12:00:00Z")} ·{" "}
                    {session.start_time}–{session.end_time}
                  </button>
                  <span>{statusLabels[session.status]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No sessions yet.</p>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="button" onClick={() => {
              setName(subject.name); setDescription(subject.description); setColor(subject.color);
              setError(""); setAdding(true);
            }}>Edit subject</button>
            <button className="text-button" disabled={pending} onClick={async () => {
              const result = await dispatch({ type: "delete-subject", id: subject.id });
              if (result) setError(result); else setSelected(null);
            }}>Delete subject</button>
            <button
              className="button button-primary"
              onClick={() => {
                setSelected(null);
                openTask("new");
              }}
            >
              Add task
            </button>
          </div>
        </Modal>
      )}
      {adding && (
        <Modal title={selected ? "Edit subject" : "Add subject"} onClose={() => setAdding(false)}>
          <form onSubmit={save} className="editor-form">
            <FormField label="Subject name">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>
            <FormField label="Description">
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
            <FormField label="Subject color">
              <select
                value={color ?? ""}
                onChange={(event) =>
                  setColor((event.target.value || null) as SubjectColor)
                }
              >
                {color?.startsWith("#") && <option value={color}>Custom color ({color})</option>}
                <option value="">Default</option>
                <option value="gold">Beige / gold</option>
                <option value="purple">Lavender</option>
                <option value="blue">Pale blue</option>
                <option value="green">Soft green</option>
              </select>
            </FormField>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button"
                type="button"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
              <button disabled={pending} className="button button-primary" type="submit">
                {selected ? "Save subject" : "Create subject"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
