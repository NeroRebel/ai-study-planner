import { useState } from "react";
import type { FormEvent } from "react";
import { useAppData } from "../../hooks/useAppData";
import { RequestError } from "../common/RequestError";
import { Modal } from "../common/Modal";
import { FormField } from "../common/FormField";
import { TaskRisk } from "../common/LiveRisk";
import { inputToISO, localInput, serializeDeadline, todayDate, addDays } from "../../utils/dates";
import { validateTask } from "../../state/appState";
import type { TaskInput } from "../../state/appState";
import type { Priority, Difficulty, TaskStatus } from "../../types";

export function TaskDialog({ id }: { id: string }) {
  const { state, dispatch, openTask, pending } = useAppData();
  const task = state.tasks.find((item) => item.id === id);
  const [form, setForm] = useState<TaskInput>(
    task
      ? { ...task }
      : {
          title: "",
          description: "",
          subject_id: state.subjects[0]?.id ?? "",
          deadline: inputToISO(addDays(todayDate(), 7) + "T23:59"),
          estimated_hours: 2,
          progress: 0,
          priority: "MEDIUM",
          difficulty: "MEDIUM",
          status: "TODO",
        },
  );
  const [deadline, setDeadline] = useState(localInput(form.deadline));
  const [error, setError] = useState("");
  function update<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    let iso: string;
    try {
      iso = serializeDeadline(deadline, task?.deadline);
    } catch {
      setError("Enter a valid local deadline.");
      return;
    }
    const value = { ...form, title: form.title.trim(), deadline: iso };
    const issue = validateTask(value);
    if (issue) {
      setError(issue);
      return;
    }
    if (!state.subjects.some((subject) => subject.id === value.subject_id)) {
      setError("Choose an existing subject.");
      return;
    }
    const result = await dispatch({
      type: "save-task",
      id: task?.id ?? "new",
      input: value,
    });
    if (result) { setError(result); return; }
    openTask(null);
  }
  if (id !== "new" && !task)
    return (
      <Modal title="Task not found" onClose={() => openTask(null)}>
        <p className="muted">
          This task is no longer in the loaded workspace.
        </p>
      </Modal>
    );
  return (
    <Modal
      title={task ? "Task details" : "Add task"}
      onClose={() => openTask(null)}
      wide
    >
      {task && (
        <div className="detail-summary">
          <span>
            {
              state.subjects.find((subject) => subject.id === task.subject_id)
                ?.name
            }
          </span>
          <TaskRisk taskId={task.id} />
          <span>{task.remaining_hours.toFixed(1)}h remaining</span>
        </div>
      )}
      <form onSubmit={save} className="editor-form" aria-busy={pending}>
        <FormField label="Title">
          <input
            required
            maxLength={160}
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </FormField>
        <FormField label="Description">
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </FormField>
        <div className="form-grid">
          <FormField label="Subject">
            <select
              required
              value={form.subject_id}
              onChange={(event) => update("subject_id", event.target.value)}
            >
              {state.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Deadline" hint="Europe/Budapest">
            <input
              type="datetime-local"
              required
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </FormField>
          <FormField label="Estimated hours">
            <input
              type="number"
              required
              min="0.02"
              step="0.01"
              value={form.estimated_hours}
              onChange={(event) =>
                update("estimated_hours", event.target.valueAsNumber || 0)
              }
            />
          </FormField>
          <FormField label="Progress (%)">
            <input
              type="number"
              required
              min="0"
              max="100"
              step="1"
              value={form.progress}
              onChange={(event) => {
                const progress = event.target.valueAsNumber || 0;
                setForm((previous) => ({
                  ...previous,
                  progress,
                  status:
                    progress === 100
                      ? "COMPLETED"
                      : previous.status === "COMPLETED"
                        ? "IN_PROGRESS"
                        : previous.status,
                }));
              }}
            />
          </FormField>
          <FormField label="Priority">
            <select
              value={form.priority}
              onChange={(event) =>
                update("priority", event.target.value as Priority)
              }
            >
              {["LOW", "MEDIUM", "HIGH"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Difficulty">
            <select
              value={form.difficulty}
              onChange={(event) =>
                update("difficulty", event.target.value as Difficulty)
              }
            >
              {["EASY", "MEDIUM", "HARD"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={(event) => {
                const status = event.target.value as TaskStatus;
                setForm((previous) => ({
                  ...previous,
                  status,
                  progress: status === "COMPLETED" ? 100 : previous.progress,
                }));
              }}
            >
              {["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </FormField>
        </div>
        <p className="form-note">
          Changes are saved to your study server. Existing reservations must fit the revised
          effort and deadline. If they conflict, edit or remove those blocks first.
          Completing or cancelling a task preserves recorded outcomes.
        </p>
<RequestError message={error} />
        <div className="form-actions">
          {task && <button type="button" className="text-button" disabled={pending}
            onClick={async () => {
              if (!window.confirm("Delete this task and all linked sessions and recorded study history? Cancel the task instead to retain history.")) return;
              const result = await dispatch({ type: "delete-task", id: task.id });
              if (result) setError(result); else openTask(null);
            }}>Delete task</button>}
          <button
            type="button"
            className="button"
            onClick={() => openTask(null)}
          >
            Cancel
          </button>
          <button disabled={pending} type="submit" className="button button-primary">
            {task ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
