import { subjectColorStyle } from "../utils/colors";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useAppData } from "../hooks/useAppData";
import { PageHeader } from "../components/common/PageHeader";
import { EmptyState } from "../components/common/EmptyState";
import { TaskCard } from "../components/tasks/TaskCard";
import { ProgressBar } from "../components/common/ProgressBar";
import { PriorityBadge } from "../components/common/PriorityBadge";
import { RiskBadge } from "../components/common/RiskBadge";
import { formatDate, statusLabels } from "../utils/format";
import { isActive } from "../state/appState";

export function TasksPage() {
  const { state, dispatch, openTask, pending } = useAppData();
  const [params] = useSearchParams();
  const taskParam = params.get("task");
  useEffect(() => {
    if (taskParam) openTask(taskParam);
  }, [taskParam, openTask]);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState(params.get("subject") ?? "ALL");
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [sort, setSort] = useState("deadline");
  const priorities = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const tasks = state.tasks
    .filter(
      (task) =>
        (!search ||
          task.title.toLowerCase().includes(search.toLowerCase()) ||
          task.description.toLowerCase().includes(search.toLowerCase())) &&
        (subject === "ALL" || task.subject_id === subject) &&
        (status === "ALL" || task.status === status) &&
        (priority === "ALL" || task.priority === priority),
    )
    .sort((a, b) =>
      sort === "priority"
        ? priorities[a.priority] - priorities[b.priority]
        : sort === "title"
          ? a.title.localeCompare(b.title)
          : a.deadline.localeCompare(b.deadline),
    );
  return (
    <div className="product-page">
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Tasks"
        description="Manage assignments and study work."
        action={
          <button
            className="button button-primary"
            onClick={() => openTask("new")}
          >
            <Plus size={16} />
            Add Task
          </button>
        }
      />
      <div className="filter-bar">
        <label className="search-control">
          <Search size={16} />
          <input
            aria-label="Search tasks"
            placeholder="Search tasks..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>Subject</span>
          <select
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          >
            <option value="ALL">All subjects</option>
            {state.subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All statuses</option>
            {["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((value) => (
              <option key={value} value={value}>
                {statusLabels[value as keyof typeof statusLabels]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="ALL">All priorities</option>
            {["HIGH", "MEDIUM", "LOW"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort by</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="deadline">Deadline</option>
            <option value="priority">Priority</option>
            <option value="title">Title</option>
          </select>
        </label>
        <button
          className="text-button"
          onClick={() => {
            setSearch("");
            setSubject("ALL");
            setStatus("ALL");
            setPriority("ALL");
          }}
        >
          Reset
        </button>
      </div>
      <div className="section-caption">
        <span>{tasks.length} tasks</span>
        <span>
          Changes are saved to server · risk not assessed
        </span>
      </div>
      {!tasks.length ? (
        <EmptyState
          title="No tasks match"
          description="Try another filter or add your first task."
          action={
            <button className="button" onClick={() => openTask("new")}>
              Add Task
            </button>
          }
        />
      ) : (
        <>
          <div className="panel tasks-desktop">
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Subject</th>
                    <th>Deadline</th>
                    <th>Priority</th>
                    <th>Progress</th>
                    <th>Remaining</th>
                    <th>Risk</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const item = state.subjects.find(
                      (subject) => subject.id === task.subject_id,
                    )!;
                    const risk = isActive(task)
                      ? state.risks.find((risk) => risk.task_id === task.id)
                      : undefined;
                    return (
                      <tr key={task.id}>
                        <td>
                          <div className="record-title">
                            <input
                              type="checkbox"
                              checked={task.status === "COMPLETED"}
                              disabled={pending || !isActive(task)}
                              onChange={() =>
                                dispatch({ type: "complete-task", id: task.id })
                              }
                              aria-label={"Complete " + task.title}
                            />
                            <button
                              className="text-button"
                              onClick={() => openTask(task.id)}
                            >
                              {task.title}
                            </button>
                          </div>
                        </td>
                        <td>
                          <span className="subject-line">
                            <i style={subjectColorStyle(item.color)} className={"subject-dot tone-" + item.color} />
                            {item.name}
                          </span>
                        </td>
                        <td>{formatDate(task.deadline)}</td>
                        <td>
                          <PriorityBadge priority={task.priority} />
                        </td>
                        <td>
                          <div className="record-progress">
                            <ProgressBar
                              value={task.progress}
                              label={task.title + " progress"}
                              color={item.color}
                            />
                            <span>{task.progress}%</span>
                          </div>
                        </td>
                        <td>{task.remaining_hours.toFixed(1)}h</td>
                        <td>
                          {risk ? (
                            <>
                              <RiskBadge level={risk.level} />
                              {risk.stale && (
                                <small className="table-subtitle">
                                  Needs reassessment
                                </small>
                              )}
                            </>
                          ) : (
                            <span className="muted">
                              {isActive(task) ? "Not assessed" : "—"}
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={
                              "status-badge status-" + task.status.toLowerCase()
                            }
                          >
                            {statusLabels[task.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="tasks-mobile">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
