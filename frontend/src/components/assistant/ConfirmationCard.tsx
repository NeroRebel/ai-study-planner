import { useEffect, useState } from "react";
import type { PendingConfirmation } from "../../api/assistant";
import type { Task } from "../../types";
import { ReplanDetails } from "../calendar/ReplanDialog";
import { motion } from "motion/react";
import { ShieldCheck, CircleCheck } from "lucide-react";

function display(value: unknown): string {
  if (value === null) return "Not set";
  if (Array.isArray(value)) return value.map(display).join(", ");
  if (typeof value === "object") return Object.entries(value as Record<string,unknown>).filter(([key])=>!["subject_id","task_id","availability_id"].includes(key)).map(([key,item])=>`${key.replaceAll("_"," ")}: ${display(item)}`).join(" · ");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)))
    return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Budapest"}).format(new Date(value)) + " (Europe/Budapest)";
  return String(value);
}
export function ConfirmationCard({confirmation,busy,onConfirm,onCancel,tasks}: {
  confirmation: PendingConfirmation; busy: boolean; onConfirm:(id:string)=>void; onCancel:(id:string)=>void; tasks: Task[];
}) {
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),5000);return ()=>clearInterval(timer);},[]);
  const expired=Date.parse(confirmation.expires_at)<=clock;
  const pending=confirmation.status==="PENDING" && !expired;
  return <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
    className={"assistant-result assistant-confirmation " + (confirmation.status === "CONFIRMED" ? "confirmation-saved" : "")} aria-label="Review proposed change">
    <div className="confirmation-label">{confirmation.status === "CONFIRMED" ? <CircleCheck size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
      {confirmation.status === "CONFIRMED" ? "Saved to your planner" : pending ? "Your approval is required" : "Proposal closed"}</div>
    <h3>{confirmation.type.replaceAll("_"," ")}</h3>
    {confirmation.preview ? <ReplanDetails preview={confirmation.preview} tasks={tasks} /> :
      <dl className="context-list">{Object.entries(confirmation.summary).filter(([key])=>key!=="action").map(([key,value])=><div key={key}><dt>{key.replaceAll("_"," ")}</dt><dd>{display(value)}</dd></div>)}</dl>}
    <p className="form-note">{pending ? "Proposed only. Confirm saves these exact changes; planner validation runs again." : expired && confirmation.status==="PENDING" ? "Confirmation expired. Ask for a new proposal." : confirmation.status==="EXPIRED" ? "Proposal unavailable or stale. Ask for a new proposal." : confirmation.status==="CONFIRMED" ? "Confirmed and saved." : "Cancelled. No changes saved."}</p>
    {pending && <div className="assistant-actions"><button className="button button-secondary" disabled={busy} onClick={()=>onCancel(confirmation.id)}>Cancel</button>
      <button className="button button-primary" disabled={busy} onClick={()=>onConfirm(confirmation.id)}>Confirm {confirmation.type==="apply_replan" ? "plan changes" : "change"}</button></div>}
  </motion.section>;
}
