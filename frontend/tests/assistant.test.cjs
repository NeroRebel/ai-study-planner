require('./register.cjs');
const test=require('node:test'), assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {createApi}=require('../src/api/index.ts');
const {createAssistantStore,assistantPrompts}=require('../src/state/assistantStore.ts');
const {AppDataContext}=require('../src/state/AppDataContext.ts');
const {AssistantPanel}=require('../src/components/assistant/AssistantPanel.tsx');
const {ConfirmationCard}=require('../src/components/assistant/ConfirmationCard.tsx');
const {createInitialState}=require('../src/state/appState.ts');
const {ApiError}=require('../src/api/client.ts');
const answer=(extra={})=>({message:'Your real task is due Friday.',provider:'fake',model:'test',actions:[],confirmation:null,metadata:{},...extra});
const pending=(type='create_task')=>({id:'action-id',type,summary:{subject:'Databases',values:{title:'Presentation',estimated_hours:3,priority:'HIGH'}},expires_at:'2099-01-01T00:00:00Z',status:'PENDING',preview:null});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

for (const [status,expected] of [[503,/AI Assistant is unavailable/],[504,/timed out/],[429,/temporarily rate-limited/]]) {
 test(`normalized ${status} error retains the original message and requires manual retry`,async t=>{
  const original=global.fetch;let requests=0,refreshes=0;
  t.after(()=>{global.fetch=original;});
  global.fetch=async()=>{requests++;return requests===1?json({detail:'SECRET provider internals'},status):json(answer());};
  const api=createApi('http://mock.invalid');
  const store=createAssistantStore(api.assistant,async()=>{refreshes++;});
  await store.send('What should I study today?');
  assert.match(store.getSnapshot().error,expected);
  assert.match(store.getSnapshot().error,/Your planner data is unchanged/);
  assert.doesNotMatch(store.getSnapshot().error,/SECRET/);
  assert.equal(requests,1);assert.equal(store.getSnapshot().canRetry,true);
  assert.equal(store.getSnapshot().messages.length,1);assert.equal(refreshes,0);
  assert.match(render(store),/Retry message/);
  await store.retry();
  assert.equal(requests,2);assert.equal(store.getSnapshot().messages.length,2);
  assert.equal(store.getSnapshot().messages[0].content,'What should I study today?');
  assert.equal(store.getSnapshot().error,'');assert.equal(refreshes,0);
 });
}
function setup(options={}) {
 const calls=[];let refreshes=0;
 const api={message:async(message,history)=>{calls.push({message,history});return options.message ? options.message(message,history):answer();},
  confirm:async id=>{calls.push({confirm:id});return options.confirm?options.confirm(id):{message:'Change saved.',planner_changed:true};},
  cancel:async id=>{calls.push({cancel:id});return {message:'Proposal cancelled.'};},
  proposeReplan:async preview=>{calls.push({review:preview});return options.proposeReplan ? options.proposeReplan(preview):answer({confirmation:pending("apply_replan")});}};
 const store=createAssistantStore(api,async()=>{refreshes++;if(options.refresh)await options.refresh();});
 return {store,calls,refreshes:()=>refreshes};
}
function render(store,full=true) {
 return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AppDataContext.Provider,
  {value:{state:{...createInitialState(),preferences:{...createInitialState().preferences,name:'Student'}},assistant:store.getSnapshot(),assistantStore:store}},React.createElement(AssistantPanel,{full}))));
}

test('Assistant starts empty with real quick actions and no scripted summary',()=>{
 const {store}=setup();const html=render(store);
 for(const prompt of assistantPrompts)assert.ok(html.includes(prompt));
 assert.doesNotMatch(html,/Scripted|DEMO|Sample conversation|No AI connection/);
 assert.match(html,/Hi, Student/);
});
test('quick action sends a normal message and renders provider response/history',async()=>{
 const {store,calls}=setup();await store.send(assistantPrompts[0]);
 assert.equal(calls[0].message,'What should I study today?');
 assert.deepEqual(calls[0].history,[]);
 assert.equal(store.getSnapshot().messages.length,2);
 assert.match(render(store),/Your real task is due Friday/);
 await store.send('Why?');assert.equal(calls[1].history.length,2);
});
test('loading state prevents duplicate sends and disables composer',async()=>{
 let finish;const {store,calls}=setup({message:()=>new Promise(resolve=>finish=resolve)});
 const request=store.send('Plan today');
 assert.equal(store.getSnapshot().busy,true);assert.match(render(store),/Working with your planner/);
 await store.send('Duplicate');assert.equal(calls.length,1);
 finish(answer());await request;assert.equal(store.getSnapshot().busy,false);
});
test('provider/network failure and retry preserve user message without duplicate history',async()=>{
 let fail=true;const {store,calls}=setup({message:async()=>{if(fail)throw new ApiError('AI unavailable.',503);return answer();}});
 await store.send('Today?');assert.match(render(store),/AI unavailable/);assert.match(render(store),/Retry message/);
 assert.equal(store.getSnapshot().messages.length,1);
 fail=false;await store.retry();assert.equal(calls.length,2);assert.equal(store.getSnapshot().messages.length,2);
 assert.deepEqual(calls[0],calls[1]);
});
test('mutation proposal renders exact confirmation and does not write before Confirm',async()=>{
 const {store,calls,refreshes}=setup({message:async()=>answer({confirmation:pending()})});
 await store.send('Create task');assert.equal(calls.length,1);assert.equal(refreshes(),0);
 const html=render(store);assert.match(html,/Review proposed change/);assert.match(html,/Presentation/);assert.match(html,/Confirm change/);
 await store.confirm('action-id');assert.deepEqual(calls[1],{confirm:'action-id'});assert.equal(refreshes(),1);
 assert.equal(store.getSnapshot().messages[1].response.confirmation.status,'CONFIRMED');
 await store.confirm('action-id');assert.equal(calls.length,2);
});
test('Cancel calls only cancel endpoint, saves no entities and cannot later Confirm',async()=>{
 const {store,calls,refreshes}=setup({message:async()=>answer({confirmation:pending()})});
 await store.send('Add a task');await store.cancel('action-id');await store.confirm('action-id');
 assert.deepEqual(calls[1],{cancel:'action-id'});assert.equal(calls.length,2);assert.equal(refreshes(),0);
 assert.match(render(store),/Cancelled. No changes saved/);
});
test('confirmation loading rejects double submission',async()=>{
 let finish;const {store,calls}=setup({message:async()=>answer({confirmation:pending()}),confirm:()=>new Promise(resolve=>finish=resolve)});
 await store.send('Create');const request=store.confirm('action-id');await store.confirm('action-id');await store.cancel('action-id');
 assert.equal(calls.length,2);assert.equal(store.getSnapshot().busy,true);finish({message:'Saved'});await request;
});
test('stale preview or expired confirmation disables unsafe apply and explains conflict',async()=>{
 const {store}=setup({message:async()=>answer({confirmation:pending('apply_replan')}),confirm:async()=>{throw new ApiError('Replan preview is stale. Request a new preview.',409);}});
 await store.send('Replan');await store.confirm('action-id');
 assert.equal(store.getSnapshot().messages[1].response.confirmation.status,'EXPIRED');
 assert.match(render(store),/Request a new preview/);assert.doesNotMatch(render(store),/Confirm plan changes/);
});
test('network uncertainty on confirm allows safe retry of the exact server action ID',async()=>{
 let fail=true;const {store,calls}=setup({message:async()=>answer({confirmation:pending()}),confirm:async()=>{if(fail)throw new ApiError('Connection lost.');return {message:'Already saved.'};}});
 await store.send('Add');await store.confirm('action-id');assert.equal(store.getSnapshot().messages[1].response.confirmation.status,'PENDING');
 fail=false;await store.confirm('action-id');assert.deepEqual(calls[1],calls[2]);
});
test('saved confirmation is not repeated when collection refresh fails',async()=>{
 const {store,calls}=setup({message:async()=>answer({confirmation:pending()}),refresh:async()=>{throw new Error('offline');}});
 await store.send('Create');await store.confirm('action-id');assert.match(store.getSnapshot().error,/Change saved/);
 await store.confirm('action-id');assert.equal(calls.length,2);
});
test('sign out disposal clears conversation, pending proposals and ignores late response',async()=>{
 let finish;const {store}=setup({message:()=>new Promise(resolve=>finish=resolve)});
 const request=store.send('Private A message');store.dispose();finish(answer({confirmation:pending()}));await request;
 assert.deepEqual(store.getSnapshot().messages,[]);assert.equal(store.getSnapshot().busy,false);
});
test('account switch has independent history and cannot confirm a previous account proposal',async()=>{
 const a=setup({message:async()=>answer({confirmation:pending()})});await a.store.send('A secret');a.store.dispose();
 const b=setup();await b.store.confirm('action-id');assert.deepEqual(b.calls,[]);assert.doesNotMatch(render(b.store),/A secret|Presentation/);
});
test('read-only risk cards use backend explanations with accessible level text',async()=>{
 const {store}=setup({message:async()=>answer({actions:[{type:'risks',tasks:[{task_id:'t',level:'HIGH',explanation:'Only 120 minutes of capacity remain.'}]}]})});
 await store.send('Risks');const html=render(store);assert.match(html,/HIGH/);assert.match(html,/Only 120 minutes/);
});
test('confirmation expires visually and never offers stale Confirm',()=>{
 const html=renderToStaticMarkup(React.createElement(ConfirmationCard,{confirmation:{...pending(),expires_at:'2000-01-01T00:00:00Z'},tasks:[],busy:false,onConfirm:()=>{},onCancel:()=>{}}));
 assert.match(html,/Confirmation expired/);assert.doesNotMatch(html,/Confirm change/);
});
test('API sends authenticated assistant request and empty, unmodifiable confirmation body',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);const calls=[];
 global.fetch=async(url,options)=>{calls.push({url,...options});return json(url.endsWith('/message')?answer():{message:'Saved'});};
 const api=createApi('http://mock.invalid',{getAccessToken:async()=>'test-token'});
 await api.assistant.message('Today?',[]);await api.assistant.confirm('abc');
 assert.equal(calls[0].headers.Authorization,'Bearer test-token');assert.deepEqual(JSON.parse(calls[0].body),{message:'Today?',history:[]});
 assert.equal(calls[1].body,'{}');
});


test('assistant replan confirmation reuses deterministic diff, risk changes and unscheduled warning',async()=>{
 const risk=(level)=>({tasks:[{task_id:'t',level,explanation:'Backend assessment.'}],subjects:[]});
 const preview={request:{date_from:'2099-01-05',date_to:'2099-01-11'},sessions_kept:[],sessions_created:[],sessions_removed:[],sessions_moved:[],affected_tasks:['t'],tasks:[{task_id:'t',unscheduled_minutes:30}],unscheduled_minutes:30,warnings:[],risk_before:risk('HIGH'),risk_after:risk('MEDIUM')};
 const {store,refreshes}=setup({message:async()=>answer({confirmation:{...pending('apply_replan'),preview}})});
 await store.send('Replan my week');const html=render(store);
 assert.match(html,/HIGH.*MEDIUM/);assert.match(html,/30 minutes could not be scheduled/);assert.match(html,/Confirm plan changes/);
 assert.equal(refreshes(),0);await store.confirm('action-id');assert.equal(refreshes(),1);
});
test('read-only replan preview renders without a confirmation or mutation',async()=>{
 const preview={request:{date_from:'2099-01-05',date_to:'2099-01-11'},sessions_kept:[],sessions_created:[],sessions_removed:[],sessions_moved:[],affected_tasks:[],tasks:[],unscheduled_minutes:0,warnings:[],risk_before:{tasks:[]},risk_after:{tasks:[]}};
 const {store,calls,refreshes}=setup({message:async()=>answer({actions:[{type:'replan_preview',preview}]})});
 await store.send('Preview my plan');assert.match(render(store),/No changes needed/);assert.doesNotMatch(render(store),/Confirm plan changes/);assert.equal(calls.length,1);assert.equal(refreshes(),0);
});


test('confirmed assistant action refreshes actual shared entities, sessions and risks from HTTP',async t=>{
 const {createAppDataStore}=require('../src/state/appDataStore.ts');
 const original=global.fetch;t.after(()=>global.fetch=original);let committed=false;let riskReads=0;
 global.fetch=async(url,options={})=>{
  if(url.endsWith('/assistant/message'))return json(answer({confirmation:pending('generate_study_plan')}));
  if(url.endsWith('/confirm')){committed=true;return json({message:'Saved',planner_changed:true});}
  if(url.includes('/risks')){riskReads++;return json({tasks:[],subjects:[],evaluated_at:'2026-11-18T10:00:00Z',expires_at:'2099-01-01T00:00:00Z'});}
  if(url.includes('/study-sessions'))return json(committed?[{id:'persisted',task_id:'t',date:'2099-01-05',start_time:'18:00:00',end_time:'19:00:00',planned_minutes:60,completed_minutes:0,status:'PLANNED',origin:'SCHEDULER'}]:[]);
  return json([]);
 };
 const api=createApi('http://mock.invalid'),data=createAppDataStore(api);await data.load();
 const chat=createAssistantStore(api.assistant,data.refreshAfterExternalMutation);
 await chat.send('Generate study plan');assert.equal(data.getSnapshot().state.sessions.length,0);
 await chat.confirm('action-id');assert.equal(data.getSnapshot().state.sessions[0].id,'persisted');assert.equal(riskReads,2);
 assert.equal(chat.getSnapshot().messages[1].response.confirmation.status,'CONFIRMED');
});


test('frontend build guard rejects server-only AI credentials',()=>{
 const {isBackendSecretName}=require('../src/auth/publicConfig.ts');
 for(const name of ['VITE_GEMINI_API_KEY','VITE_OPENAI_API_KEY','VITE_AI_API_KEY','VITE_SUPABASE_SERVICE_ROLE_KEY'])assert.equal(isBackendSecretName(name),true);
 assert.equal(isBackendSecretName('VITE_SUPABASE_PUBLISHABLE_KEY'),false);assert.equal(isBackendSecretName('VITE_API_BASE_URL'),false);
});


test('Review for Apply requests a server-owned confirmation without executing or calling the model again',async()=>{
 const preview={request:{date_from:'2099-01-05',date_to:'2099-01-11'},sessions_kept:[],sessions_created:[],sessions_removed:[],sessions_moved:[],affected_tasks:[],tasks:[],unscheduled_minutes:0,warnings:[],risk_before:{tasks:[]},risk_after:{tasks:[]}};
 const {store,calls,refreshes}=setup({message:async()=>answer({actions:[{type:'replan_preview',preview}]})});
 await store.send('Replan');assert.match(render(store),/Review for Apply/);
 await store.requestReplanApproval(preview);assert.deepEqual(calls[1],{review:preview});assert.equal(refreshes(),0);
 assert.match(render(store),/Confirm plan changes/);await store.confirm('action-id');assert.equal(refreshes(),1);
});
test('Review for Apply reports stale preview conflicts without offering confirmation',async()=>{
 const {store}=setup({proposeReplan:async()=>{throw new ApiError('Preview stale. Request a new preview.',409);}});
 await store.requestReplanApproval({});assert.match(store.getSnapshot().error,/Preview stale/);assert.equal(store.getSnapshot().messages.length,0);
});
