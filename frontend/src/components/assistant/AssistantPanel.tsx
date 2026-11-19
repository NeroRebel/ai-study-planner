import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Send, Sparkles, PanelRightClose, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppData } from "../../hooks/useAppData";
import { assistantPrompts } from "../../state/assistantStore";
import { AssistantMessage } from "./AssistantMessage";
import { ConfirmationCard } from "./ConfirmationCard";
import { ReplanDetails } from "../calendar/ReplanDialog";
import { motion, AnimatePresence } from "motion/react";
import { Feedback } from "../common/Feedback";
import { RiskBadge } from "../common/RiskBadge";
import { useUiPreferences } from "../../state/uiPreferences";

export function AssistantPanel({ full = false, onClose }: { full?: boolean; onClose?: () => void }) {
  const { state, assistant, assistantStore } = useAppData();
  const preferences = useUiPreferences();
  const [text, setText] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    const content=contentRef.current;
    if (content && followLatest.current) content.scrollTop=content.scrollHeight;
  }, [assistant.messages, assistant.busy, assistant.error]);
  function send(value: string) {
    if (!value.trim() || assistant.busy) return;
    followLatest.current=true;
    setText(""); void assistantStore.send(value);
  }
  function submit(event: FormEvent) { event.preventDefault(); send(text); }
  return <aside className={"assistant-panel " + (full ? "assistant-full" : "")} aria-label="AI Study Assistant">
    <header className="assistant-heading">
      <span className="assistant-emblem"><Sparkles size={18} aria-hidden="true" /></span>
      <div><h2>AI Study Assistant</h2><small>Your planner, explained.</small></div>
      {onClose && <button type="button" className="icon-button assistant-panel-close" onClick={onClose} aria-label="Hide assistant panel" title="Hide assistant panel"><PanelRightClose size={18} strokeWidth={1.7} aria-hidden="true" /></button>}
    </header>
    <div className="assistant-content" ref={contentRef} onScroll={event=>{
      const element=event.currentTarget;
      followLatest.current=element.scrollHeight-element.scrollTop-element.clientHeight<80;
    }}>
      {!assistant.messages.length && <div className="assistant-welcome"><h3>Hi, {state.preferences.name}.</h3><p>I can help with your schedule, deadlines, risks and replanning. What would you like to work on?</p></div>}
      <div className="conversation" aria-label="Study conversation" aria-live="polite" aria-busy={assistant.busy}>
        {assistant.messages.map(message=><div key={message.id}>
          <AssistantMessage message={message} />
          {message.response?.actions.map((card,index)=>card.preview ?
            <details className="assistant-result" key={index} open={preferences.expandExplanations}><summary>Replanning preview · not saved</summary><ReplanDetails preview={card.preview} tasks={state.tasks} />
              <button className="button button-secondary" disabled={assistant.busy} onClick={()=>card.preview && void assistantStore.requestReplanApproval(card.preview)}>Review for Apply</button></details> :
            card.type==="risks" && <details className="assistant-result" key={index} open={preferences.expandExplanations}><summary>Assessed deadline risks</summary>
              {card.evaluated_at && <p className="form-note">Assessment at {new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Budapest"}).format(new Date(card.evaluated_at))}</p>}
              <ul className="detail-list">{card.tasks?.map(risk=><li key={risk.task_id}><strong>{state.tasks.find(task=>task.id===risk.task_id)?.title ?? "Task"}</strong><span>{risk.level ? <RiskBadge level={risk.level} /> : "No active risk"}</span><small>{risk.explanation}</small></li>)}</ul>
            </details>)}
          {message.response?.confirmation && <ConfirmationCard confirmation={message.response.confirmation} busy={assistant.busy}
            onConfirm={id=>void assistantStore.confirm(id)} onCancel={id=>void assistantStore.cancel(id)} tasks={state.tasks} />}
        </div>)}
        <AnimatePresence initial={false}>
          {assistant.busy && <motion.div key="thinking" className="assistant-thinking" role="status"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="status-indicator" aria-hidden="true"><i /><i /><i /></span>
            Working with your planner…
          </motion.div>}
        </AnimatePresence>
      </div>
      {assistant.error && <Feedback tone="error" action={assistant.canRetry && <button className="button button-secondary" disabled={assistant.busy} onClick={()=>void assistantStore.retry()}>Retry message</button>}><p>{assistant.error}</p></Feedback>}
      {(preferences.showQuickPrompts || !assistant.messages.length) && <div className="assistant-suggestions"><span>Ask about your planner</span>
        {assistantPrompts.map(prompt=><motion.button key={prompt} whileTap={assistant.busy ? undefined : { scale: 0.98 }} disabled={assistant.busy} onClick={()=>send(prompt)}><span>{prompt}</span><ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" /></motion.button>)}
      </div>}
      <div className="assistant-actions"><Link to="/calendar">View calendar</Link><Link to="/tasks">Open tasks</Link></div>
    </div>
    <form className="assistant-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor={full ? "full-assistant-input" : "assistant-input"}>Message study assistant</label>
      <textarea id={full ? "full-assistant-input" : "assistant-input"} value={text} onChange={event=>setText(event.target.value)}
        rows={2} placeholder="Ask about your study work…" maxLength={2000} disabled={assistant.busy}
        onKeyDown={event=>{if(event.key==="Enter" && !event.shiftKey && !event.nativeEvent.isComposing){event.preventDefault();send(text);}}} />
      <div className="composer-toolbar"><span>Grounded in your planner</span><button className="composer-send" type="submit" disabled={!text.trim() || assistant.busy} aria-label="Send message"><Send size={16} /></button></div>
      <small>Enter to send · Shift + Enter for a new line. AI can make mistakes. Review details before confirming changes.</small>
    </form>
  </aside>;
}
