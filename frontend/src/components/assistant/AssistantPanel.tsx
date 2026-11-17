import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarPlus,
  Send,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAppData } from "../../hooks/useAppData";
import { isActive } from "../../state/appState";
import {
  mockAssistantReply,
  assistantPrompts,
} from "../../services/mockAssistant";
import { dueLabel, nextFriday } from "../../utils/dates";
import { AssistantMessage } from "./AssistantMessage";

export function AssistantPanel({ full = false }: { full?: boolean }) {
  const { state, messages, addMessage, openTask, openSession } = useAppData();
  const [text, setText] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef(messages.length);
  const active = state.tasks.filter(isActive);
  const task = active.find((item) => state.subjects.some(subject => subject.id === item.subject_id && subject.name.toLowerCase().includes("management"))) ?? active[0];
  const risk = state.risks.find((item) => item.task_id === task?.id);
  useEffect(() => {
    const content = contentRef.current;
    if (content && messages.length > previousMessageCount.current)
      content.scrollTop = content.scrollHeight;
    previousMessageCount.current = messages.length;
  }, [messages.length]);
  function send(value: string) {
    const input = value.trim();
    if (!input) return;
    addMessage("user", input);
    addMessage("assistant", mockAssistantReply(state, input));
    setText("");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    send(text);
  }
  function reschedule() {
    const target = active.find((item) => state.subjects.some(subject => subject.id === item.subject_id && subject.name.toLowerCase().includes("thesis")));
    const session = state.sessions.find(
      (item) => item.task_id === target?.id && item.status === "PLANNED",
    );
    if (session) openSession({ id: session.id });
    else if (target)
      openSession({ id: "new", task_id: target.id, date: nextFriday() });
    else
      addMessage(
        "assistant",
        "No active Thesis task is available to reschedule. Add a task first.",
      );
  }
  return (
    <aside
      className={"assistant-panel " + (full ? "assistant-full" : "")}
      aria-label="AI Study Assistant prototype"
    >
      <header className="assistant-heading">
        <span className="assistant-emblem">
          <Sparkles size={18} aria-hidden="true" />
        </span>
        <h2>AI Study Assistant</h2>
        <span className="preview-pill">DEMO</span>
      </header>
      <div className="assistant-content" ref={contentRef}>
        <div
          className="conversation"
          aria-label="Sample conversation"
          aria-live="polite"
        >
          {messages.map((message) => (
            <AssistantMessage key={message.id} message={message} />
          ))}
        </div>
        {full && (
          <div className="assistant-suggestions">
            <span>Try a sample question</span>
            {assistantPrompts.map((prompt) => (
              <button key={prompt} onClick={() => send(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        )}
        {task && (
          <div className="risk-warning">
            <span className="warning-title">
              <AlertTriangle size={15} />
              {risk ? risk.level + " prototype assessment" : "Deadline · not assessed"}
              {risk?.stale ? " · needs reassessment" : ""}
            </span>
            <strong>{task.title}</strong>
            <span>{dueLabel(task.deadline)}</span>
            <p>
              You've completed {task.progress}%. Keep this deadline in sight.
            </p>
            <Link to="/deadlines">
              View deadline
              <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <div className="assistant-actions">
          <button
            type="button"
            disabled={!task}
            onClick={() => task && openSession({ id: "new", task_id: task.id })}
          >
            <CalendarPlus size={14} />
            Add focus block
          </button>
          <button type="button" disabled={!active.length} onClick={reschedule}>
            Reschedule
          </button>
          {full && (
            <>
              <button
                type="button"
                disabled={!task}
                onClick={() => task && openTask(task.id)}
              >
                Open task
              </button>
              <Link to="/calendar">View calendar</Link>
            </>
          )}
        </div>
      </div>
      <form className="assistant-composer" onSubmit={submit}>
        <label
          className="sr-only"
          htmlFor={full ? "full-assistant-input" : "assistant-input"}
        >
          Message study assistant
        </label>
        <input
          id={full ? "full-assistant-input" : "assistant-input"}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask about your study work..."
          maxLength={1000}
        />
        <div className="composer-toolbar">
          <span>Scripted demo · saved task context</span>
          <button
            className="composer-send"
            type="submit"
            disabled={!text.trim()}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <small>
          No AI connection · changes require an explicit action and save
        </small>
      </form>
    </aside>
  );
}
