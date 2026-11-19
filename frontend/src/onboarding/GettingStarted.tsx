import {useContext} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {AuthContext} from '../auth/AuthContext';
import {useAppData} from '../hooks/useAppData';
import {Button} from '../components/common/Controls';

export function GettingStarted({assistant=false}:{assistant?:boolean}) {
  const auth=useContext(AuthContext),{state,openTask,assistantStore,assistant:chat}=useAppData();
  const [query]=useSearchParams();
  if(!auth?.profile?.onboarding_completed || (state.tasks.length>0&&!query.has('setup')))return null;
  if(assistant)return <section className="getting-started" aria-label="AI-assisted initial setup"><strong>Build your first study plan, together.</strong>
    <p>Tell your Assistant what is due, the exact deadlines, remaining effort and when you are available to study. Each saved change needs your confirmation. Your preferences are context, not calendar bookings.</p>
    {!state.subjects.length&&<p><Link className="text-button" to="/subjects">Add a subject first →</Link> Task creation needs a saved subject.</p>}
    <Button disabled={chat.busy} onClick={()=>{void assistantStore.send('Help me set up my first study plan. Read my profile preferences, subjects, tasks and availability first. Ask me for missing upcoming assignments, exact deadlines, effort and dated availability. Propose each change for confirmation, then offer the deterministic Scheduler for an agreed planning horizon. Do not invent missing data.');}}>Start guided setup</Button>
  </section>;
  return <section className="getting-started" aria-label="Workspace first actions"><strong>Your workspace is ready.</strong><p>Add real deadlines and study time before generating a plan. Your preferences can be edited in Settings.</p><div className="header-actions">
    {!state.subjects.length&&<Link className="button" to="/subjects">Add subject</Link>}<Button onClick={()=>openTask('new')} disabled={!state.subjects.length}>Add task</Button><Link className="button" to="/calendar">Add availability</Link><Link className="button" to="/calendar">Generate study plan</Link>
  </div></section>;
}
