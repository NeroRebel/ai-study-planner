import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Send, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppData } from "../../hooks/useAppData";
import { assistantPrompts } from "../../state/assistantStore";
import { AssistantMessage } from "./AssistantMessage";
import { ConfirmationCard } from "./ConfirmationCard";
import { ReplanDetails } from "../calendar/ReplanDialog";

export function AssistantPanel({ full = false }: { full?: boolean }) {
  const { state, assistant, assistantStore } = useAppData();
  const [text, setText] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content=contentRef.current;
    if (content) content.scrollTop=content.scrollHeight;
  }, [assistant.messages.length, assistant.busy]);
  function send(value: string) {
    if (!value.trim() || assistant.busy) return;
    setText(""); void assistantStore.send(value);
  }
  function submit(event: FormEvent) { event.preventDefault(); send(text); }
  return <aside className={"assistant-panel " + (full ? "assistant-full" : "")} aria-label="AI Study Assistant">
    <header className="assistant-heading">
      <span className="assistant-emblem"><Sparkles size={18} aria-hidden="true" /></span>
      <h2>AI Study Assistant</h2>
    </header>
    <div className="assistant-content" ref={contentRef}>
      {!assistant.messages.length && <p className="context-copy">Hi, {state.preferences.name}. I can help with your schedule, deadlines, risks and replanning. What would you like to work on?</p>}
      <div className="conversation" aria-label="Study conversation" aria-live="polite" aria-busy={assistant.busy}>
        {assistant.messages.map(message=><div key={message.id}>
          <AssistantMessage message={message} />
          {message.response?.actions.map((card,index)=>card.preview ?
            <details className="assistant-result" key={index}><summary>Replanning preview · not saved</summary><ReplanDetails preview={card.preview} tasks={state.tasks} />
              <button className="button button-secondary" disabled={assistant.busy} onClick={()=>card.preview && void assistantStore.requestReplanApproval(card.preview)}>Review for Apply</button></details> :
            card.type==="risks" && <details className="assistant-result" key={index}><summary>Assessed deadline risks</summary>
              {card.evaluated_at && <p className="form-note">Assessment at {new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Budapest"}).format(new Date(card.evaluated_at))}</p>}
              <ul className="detail-list">{card.tasks?.map(risk=><li key={risk.task_id}><strong>{state.tasks.find(task=>task.id===risk.task_id)?.title ?? "Task"}</strong><span>{risk.level ?? "No active risk"}</span><small>{risk.explanation}</small></li>)}</ul>
            </details>)}
          {message.response?.confirmation && <ConfirmationCard confirmation={message.response.confirmation} busy={assistant.busy}
            onConfirm={id=>void assistantStore.confirm(id)} onCancel={id=>void assistantStore.cancel(id)} tasks={state.tasks} />}
        </div>)}
        {assistant.busy && <p className="form-note" role="status">Working with your planner…</p>}
      </div>
      {assistant.error && <div className="data-notice" role="alert"><p>{assistant.error}</p>
        {assistant.canRetry && <button className="button button-secondary" disabled={assistant.busy} onClick={()=>void assistantStore.retry()}>Retry message</button>}
      </div>}
      {(full || !assistant.messages.length) && <div className="assistant-suggestions"><span>Ask about your planner</span>
        {assistantPrompts.map(prompt=><button key={prompt} disabled={assistant.busy} onClick={()=>send(prompt)}>{prompt}</button>)}
      </div>}
      <div className="assistant-actions"><Link to="/calendar">View calendar</Link><Link to="/tasks">Open tasks</Link></div>
    </div>
    <form className="assistant-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor={full ? "full-assistant-input" : "assistant-input"}>Message study assistant</label>
      <input id={full ? "full-assistant-input" : "assistant-input"} value={text} onChange={event=>setText(event.target.value)}
        placeholder="Ask about your study work..." maxLength={2000} disabled={assistant.busy} />
      <div className="composer-toolbar"><span>Grounded in your planner</span><button className="composer-send" type="submit" disabled={!text.trim() || assistant.busy} aria-label="Send message"><Send size={16} /></button></div>
      <small>AI can make mistakes. Review details before confirming changes.</small>
    </form>
  </aside>;
}
