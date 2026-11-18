require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {createApi}=require('../src/api/index.ts');
const {createAppDataStore}=require('../src/state/appDataStore.ts');
const {AppDataContext}=require('../src/state/AppDataContext.ts');
const {WeeklyPlanner}=require('../src/components/calendar/WeeklyPlanner.tsx');
const {ReplanDialog}=require('../src/components/calendar/ReplanDialog.tsx');
const {currentWeek,addDays}=require('../src/utils/dates.ts');
const range=()=>({date_from:currentWeek(),date_to:addDays(currentWeek(),6)});
const session=(id='generated')=>({id,task_id:'t',origin:'SCHEDULER',date:currentWeek(),start_time:'17:00:00',end_time:'18:00:00',planned_minutes:60,completed_minutes:0,status:'PLANNED'});
const task={id:'t',subject_id:'s',title:'Database exam',deadline:'2099-01-01T00:00:00Z',estimated_hours:2,remaining_hours:2,status:'TODO',progress:0};
const risks={tasks:[],subjects:[],evaluated_at:'2026-11-18T10:00:00Z',expires_at:'2099-01-01T00:00:00Z'};
const preview=()=>({policy_version:'affected-v1',request:range(),evaluated_at:'2026-11-18T10:00:00Z',expires_at:'2099-01-01T00:00:00Z',fingerprint:'a'.repeat(64),plan_digest:'b'.repeat(64),sessions_kept:[],sessions_created:[session()],sessions_moved:[],sessions_removed:[],affected_tasks:['t'],tasks:[],unscheduled_minutes:0,tasks_fully_scheduled:1,tasks_partially_scheduled:0,tasks_unscheduled:0,reasons:[],warnings:[],risk_before:{...risks,tasks:[{task_id:'t',level:'HIGH'}]},risk_after:{...risks,tasks:[{task_id:'t',level:'MEDIUM',explanation:'Capacity is now scheduled.'}]},applied:false});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
async function setup(t,options={}) {
 const original=global.fetch,calls=[];let sessions=[],failRefresh=false;
 global.fetch=async(url,request={})=>{
  calls.push({url,...request});
  if(url.endsWith('/replan/preview'))return options.preview?options.preview():json(preview());
  if(url.endsWith('/replan/apply')){
   const response=options.apply?await options.apply():json({...preview(),applied:true});
   if(response.ok)sessions=[session()];return response;
  }
  if(request.method==='PATCH')return json(task);
  if(failRefresh)throw new TypeError('offline');
  return json(url.includes('/api/risks')?risks:url.includes('/study-sessions')?sessions:url.includes('/tasks')?[task]:[]);
 };
 t.after(()=>global.fetch=original);
 const store=createAppDataStore(createApi('http://mock.invalid'));await store.load();
 return {store,calls,failRefresh:()=>failRefresh=true};
}
function render(store,Component=ReplanDialog,props={}) {
 return renderToStaticMarkup(React.createElement(AppDataContext.Provider,{value:{...store.getSnapshot(),previewReplan:store.previewReplan,applyReplan:store.applyReplan,cancelReplan:store.cancelReplan,openSession:()=>{}}},React.createElement(Component,props)));
}
const posts=(calls,suffix)=>calls.filter(c=>c.url.endsWith(suffix)&&c.method==='POST');

test('Calendar Replan action is rendered without changing existing planner UI',async t=>{
 const {store}=await setup(t);assert.match(render(store,WeeklyPlanner,{expanded:true}),/>Replan</);
});
test('preview loading is visible, disables changes and prevents duplicate submissions',async t=>{
 let release;const blocked=new Promise(resolve=>release=resolve);
 const {store,calls}=await setup(t,{preview:()=>blocked});const pending=store.previewReplan(range());
 assert.equal(store.getSnapshot().pending,true);assert.match(render(store),/Preparing a safe replanning preview/);
 await store.previewReplan(range());assert.equal(posts(calls,'/preview').length,1);
 release(json(preview()));await pending;assert.equal(store.getSnapshot().pending,false);
});
test('preview maps times, shows diff and risk change without mutating shared entities',async t=>{
 const {store,calls}=await setup(t);const before=store.getSnapshot().state;await store.previewReplan(range());
 assert.equal(store.getSnapshot().state,before);assert.equal(posts(calls,'/apply').length,0);
 assert.equal(store.getSnapshot().replanPreview.sessions_created[0].start_time,'17:00');
 const html=render(store);assert.match(html,/1 session changes proposed/);assert.match(html,/HIGH → MEDIUM/);assert.match(html,/Database exam/);assert.match(html,/Added: 1/);
});
test('no-op preview has honest feedback and disables apply',async t=>{
 const {store}=await setup(t,{preview:()=>json({...preview(),sessions_created:[],affected_tasks:[]})});await store.previewReplan(range());
 const html=render(store);assert.match(html,/No changes needed/);assert.match(html,/disabled=""[^>]*>Apply changes/);
});
test('partial preview exposes per-task unscheduled work and kept risk',async t=>{
 const {store}=await setup(t,{preview:()=>json({...preview(),unscheduled_minutes:120,tasks:[{task_id:'t',unscheduled_minutes:120}],risk_after:{...risks,tasks:[{task_id:'t',level:'HIGH'}]}})});
 await store.previewReplan(range());const html=render(store);assert.match(html,/120 minutes could not be scheduled/);assert.match(html,/2.0h unscheduled/);assert.match(html,/No risk change/);assert.match(html,/role="alert"/);
});
test('Cancel discards preview without making any apply request',async t=>{
 const {store,calls}=await setup(t);await store.previewReplan(range());store.cancelReplan();
 assert.equal(store.getSnapshot().replanPreview,null);assert.equal(store.getSnapshot().replanStatus,'idle');assert.equal(posts(calls,'/apply').length,0);assert.equal(render(store),'');
});
test('Apply sends versioned request and refreshes persisted sessions, tasks and live risks',async t=>{
 const {store,calls}=await setup(t);await store.previewReplan(range());await store.applyReplan();
 assert.deepEqual(JSON.parse(posts(calls,'/apply')[0].body),{...range(),evaluated_at:preview().evaluated_at,fingerprint:preview().fingerprint,plan_digest:preview().plan_digest});
 assert.equal(store.getSnapshot().state.sessions[0].id,'generated');assert.equal(store.getSnapshot().replanStatus,'applied');
 assert.equal(store.getSnapshot().replanPreview,null);assert.equal(store.getSnapshot().riskStatus,'ready');
 assert.equal(calls.filter(c=>c.url.includes('/api/risks')).length,2);assert.equal(calls.filter(c=>c.url.includes('/api/tasks')).length,2);
 assert.match(render(store,WeeklyPlanner,{expanded:true}),/Study plan updated: 0 moved, 1 added, 0 removed/);
});
test('double apply is prevented and Cancel cannot interrupt an applying transaction',async t=>{
 let release;const blocked=new Promise(resolve=>release=resolve);
 const {store,calls}=await setup(t,{apply:()=>blocked});await store.previewReplan(range());const pending=store.applyReplan();
 await store.applyReplan();store.cancelReplan();assert.equal(posts(calls,'/apply').length,1);assert.equal(store.getSnapshot().replanStatus,'applying');
 assert.match(render(store),/Applying changes/);release(json({...preview(),applied:true}));await pending;
});
test('stale conflict removes unsafe apply option and asks for a new preview',async t=>{
 const {store,calls}=await setup(t,{apply:()=>json({detail:'Replan preview is stale. Request a new preview.'},409)});
 await store.previewReplan(range());await store.applyReplan();assert.equal(store.getSnapshot().replanPreview,null);
 assert.match(render(store),/preview is stale/);assert.match(render(store),/Request fresh preview/);
 await store.applyReplan();assert.equal(posts(calls,'/apply').length,1);
});
for(const action of ['preview','apply'])test(`${action} network failure is actionable and does not offer unsafe apply`,async t=>{
 const {store}=await setup(t,{[action]:()=>{throw new TypeError('offline');}});
 await store.previewReplan(range());if(action==='apply')await store.applyReplan();
 assert.match(render(store),/Cannot reach the study server/);assert.equal(store.getSnapshot().pending,false);assert.equal(store.getSnapshot().replanPreview,null);
});
test('ordinary persistent edits invalidate an open preview',async t=>{
 const {store}=await setup(t);await store.previewReplan(range());await store.dispatch({type:'complete-task',id:'t'});
 assert.equal(store.getSnapshot().replanPreview,null);assert.equal(store.getSnapshot().replanStatus,'idle');
});
test('committed apply followed by failed refresh is not retried as a failed mutation',async t=>{
 const options={};const {store,calls,failRefresh}=await setup(t,options);await store.previewReplan(range());
 options.apply=()=>{failRefresh();return json({...preview(),applied:true});};await store.applyReplan();
 assert.equal(store.getSnapshot().replanStatus,'applied');assert.equal(store.getSnapshot().status,'error');assert.equal(store.getSnapshot().replanPreview,null);
 await store.applyReplan();assert.equal(posts(calls,'/apply').length,1);
});


test('Apply retains an honest remaining-work warning after partial success',async t=>{
 const {store}=await setup(t,{apply:()=>json({...preview(),applied:true,unscheduled_minutes:120})});
 await store.previewReplan(range());await store.applyReplan();
 assert.match(render(store,WeeklyPlanner,{expanded:true}),/120 minutes remain unscheduled/);
});
