import type { ReplanPreview } from "../api/replanning";
import type { AppApi } from "../api";
import type { AssistantResponse, PendingConfirmation } from "../api/assistant";
import { ApiError, errorMessage } from "../api/client";

export const assistantPrompts = ["What should I study today?", "Check my risks", "Can I meet my deadlines?", "Replan my week"];
export interface ChatMessage {
  id: string; role: "assistant" | "user"; content: string; response?: AssistantResponse;
}
export interface AssistantSnapshot { messages: ChatMessage[]; busy: boolean; error: string; canRetry: boolean; }
export function createAssistantStore(api: AppApi["assistant"], refresh: () => Promise<unknown>) {
  let snapshot: AssistantSnapshot = {messages:[],busy:false,error:"",canRetry:false};
  let disposed = false;
  let failedRequest: {message:string; history: {role:"user" | "assistant";content:string}[]} | null = null;
  const listeners = new Set<() => void>();
  function publish(change: Partial<AssistantSnapshot>) {
    if (disposed) return;
    snapshot={...snapshot,...change}; listeners.forEach(listener=>listener());
  }
  function append(message: ChatMessage) { publish({messages:[...snapshot.messages,message].slice(-80)}); }
  async function run(request: NonNullable<typeof failedRequest>) {
    if (snapshot.busy || disposed) return;
    publish({busy:true,error:"",canRetry:false}); failedRequest=null;
    try {
      const response=await api.message(request.message,request.history);
      append({id:crypto.randomUUID(),role:"assistant",content:response.message,response});
    } catch (error) {
      failedRequest=request;publish({error:errorMessage(error),canRetry:true});
    } finally { publish({busy:false}); }
  }
  async function send(input: string) {
    const message=input.trim(); if (!message || message.length>2000 || snapshot.busy || disposed) return;
    const history=snapshot.messages.slice(-12).map(({role,content})=>({role,content:content.slice(0,4000)}));
    append({id:crypto.randomUUID(),role:"user",content:message});
    await run({message,history});
  }
  function updateConfirmation(id: string, status: PendingConfirmation["status"]) {
    publish({messages:snapshot.messages.map(message=>message.response?.confirmation?.id===id ?
      {...message,response:{...message.response,confirmation:{...message.response.confirmation,status}}} : message)});
  }
  async function action(id: string, confirm: boolean) {
    const proposal=snapshot.messages.find(message=>message.response?.confirmation?.id===id)?.response?.confirmation;
    if (!proposal || proposal.status!=="PENDING" || snapshot.busy || disposed) return;
    publish({busy:true,error:"",canRetry:false});
    try {
      const result=await (confirm ? api.confirm(id) : api.cancel(id));
      updateConfirmation(id,confirm?"CONFIRMED":"CANCELLED");
      append({id:crypto.randomUUID(),role:"assistant",content:result.message});
      if (confirm && !disposed) {
        try { await refresh(); }
        catch { publish({error:"Change saved. Refresh planner data to see the latest result."}); }
      }
    } catch (error) {
      if (error instanceof ApiError && [404,409,410].includes(error.status)) updateConfirmation(id,"EXPIRED");
      publish({error:errorMessage(error)});
    } finally { publish({busy:false}); }
  }
  async function requestReplanApproval(preview: ReplanPreview) {
    if (snapshot.busy || disposed) return;
    publish({busy:true,error:"",canRetry:false});
    try {
      const response=await api.proposeReplan(preview);
      append({id:crypto.randomUUID(),role:"assistant",content:response.message,response});
    } catch (error) { publish({error:errorMessage(error)}); }
    finally { publish({busy:false}); }
  }
  return {
    requestReplanApproval,
    getSnapshot:()=>snapshot,
    subscribe(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener);};},
    hasSubscribers:()=>listeners.size>0,
    send, retry:()=>failedRequest ? run(failedRequest) : Promise.resolve(),
    confirm:(id:string)=>action(id,true),cancel:(id:string)=>action(id,false),
    dispose() {disposed=true;failedRequest=null;snapshot={messages:[],busy:false,error:"",canRetry:false};listeners.clear();},
  };
}
export type AssistantStore = ReturnType<typeof createAssistantStore>;
