require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {createApi}=require('../src/api/index.ts');
const {createAppDataStore}=require('../src/state/appDataStore.ts');
const {createInitialState}=require('../src/state/appState.ts');
const {selectSummary,selectDays}=require('../src/state/selectors.ts');
const {AppDataContext}=require('../src/state/AppDataContext.ts');
const {RiskValue,RiskNotice}=require('../src/components/common/LiveRisk.tsx');
const {SubjectCard}=require('../src/components/subjects/SubjectCard.tsx');
const {SubjectDeadlineList}=require('../src/pages/SubjectsPage.tsx');
const {DeadlinesPage}=require('../src/pages/DeadlinesPage.tsx');
const {DashboardPage}=require('../src/pages/DashboardPage.tsx');
const freshness={evaluated_at:'2026-11-17T10:00:00Z',expires_at:'2099-01-01T00:00:00Z',stale:false};
const task={id:'t',subject_id:'s',title:'Database exam',description:'',deadline:'2098-12-10T20:00:00Z',remaining_hours:4,estimated_hours:5,progress:20,status:'IN_PROGRESS',priority:'HIGH',difficulty:'MEDIUM'};
const subject={id:'s',name:'Databases',description:'Course',color:'gold'};
const assessment=(level='HIGH')=>({...freshness,task_id:'t',subject_id:'s',level,status:level?'assessed':'not_applicable',remaining_minutes:240,scheduled_minutes:0,allocated_free_minutes:120,shared_slack_minutes:0,free_available_minutes:120,capacity_minutes:120,shortfall_minutes:120,deadline:task.deadline,minutes_until_deadline:9999,explanation:'Only 2.0h of capacity is available for 4.0h of work.',reasons:['insufficient_capacity']});
const batch=(level='HIGH')=>({...freshness,policy_version:'capacity-v1',timezone:'Europe/Budapest',tasks:[assessment(level)],subjects:[{...freshness,subject_id:'s',level,status:level?'assessed':'not_applicable',active_task_count:level?1:0,high_count:level==='HIGH'?1:0,medium_count:0,low_count:0,unavailable_count:0,explanation:'Subject assessment'}],warnings:[]});
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
function setup(t,readRisk=async()=>json(batch())) {
 const original=global.fetch,calls=[];
 global.fetch=async(url,options={})=>{
  calls.push({url,...options});
  if(url.endsWith('/api/risks'))return readRisk();
  if(options.method==='PATCH')return json({...task,...JSON.parse(options.body)});
  return json(url.includes('/subjects')?[subject]:url.includes('/tasks')?[task]:[]);
 };
 t.after(()=>{global.fetch=original;});
 return {store:createAppDataStore(createApi('http://mock.invalid')),calls};
}
function render(component,props={},overrides={}) {
 const state={...createInitialState(),tasks:[task],subjects:[subject],risks:[assessment()],subjectRisks:batch().subjects};
 const value={state,riskStatus:'ready',riskError:'',pending:false,assistant:{messages:[],busy:false,error:"",canRetry:false},assistantStore:{send:async()=>{}},summary:selectSummary(state),studyDays:selectDays(state),openTask:()=>{},openSession:()=>{},refreshRisks:async()=>{},...overrides};
 return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AppDataContext.Provider,{value},React.createElement(component,props))));
}
test('batch API maps root freshness onto task and subject assessments',async t=>{
 const {store,calls}=setup(t);await store.load();
 assert.equal(store.getSnapshot().riskStatus,'ready');
 assert.equal(store.getSnapshot().state.risks[0].expires_at,freshness.expires_at);
 assert.equal(store.getSnapshot().state.subjectRisks[0].stale,false);
 assert.equal(calls.filter(c=>c.url.endsWith('/api/risks')).length,1);
});
test('risk loading does not block successful entity loading and duplicate reads are shared',async t=>{
 let release;const blocked=new Promise(resolve=>release=resolve);
 const {store,calls}=setup(t,()=>blocked);const loading=store.load();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(store.getSnapshot().status,'ready');assert.equal(store.getSnapshot().riskStatus,'loading');
 const refresh=store.refreshRisks();assert.equal(calls.length,5);
 release(json(batch()));await Promise.all([loading,refresh]);assert.equal(store.getSnapshot().riskStatus,'ready');
 assert.match(render(RiskValue,{assessment:assessment()},{riskStatus:'loading'}),/Checking risk/);
});
test('network risk failure preserves core data and supports independent retry',async t=>{
 let failed=true;const {store}=setup(t,async()=>{if(failed)throw new TypeError('offline');return json(batch());});
 await store.load();assert.equal(store.getSnapshot().status,'ready');assert.equal(store.getSnapshot().state.tasks.length,1);
 assert.equal(store.getSnapshot().riskStatus,'error');
 const html=render(RiskNotice,{},store.getSnapshot());assert.match(html,/Retry risk assessment/);assert.match(html,/role="alert"/);
 assert.match(render(RiskValue,{assessment:assessment()},{riskStatus:'error'}),/Risk unavailable/);
 failed=false;await store.refreshRisks();assert.equal(store.getSnapshot().riskStatus,'ready');
});
test('mutations invalidate in-flight assessment and reload one fresh batch',async t=>{
 let count=0,release;
 const blocked=new Promise(resolve=>release=resolve);
 const {store,calls}=setup(t,()=>++count===1?blocked:Promise.resolve(json(batch('LOW'))));
 const initial=store.load();await new Promise(resolve=>setImmediate(resolve));
 await store.dispatch({type:'complete-task',id:'t'});
 release(json(batch('HIGH')));await initial;
 assert.equal(store.getSnapshot().state.risks[0].level,'LOW');
 assert.equal(calls.filter(c=>c.url.endsWith('/api/risks')).length,2);
});
for(const level of ['LOW','MEDIUM','HIGH'])test(`${level} risk renders accessibly on Subject cards and modal task list`,()=>{
 const state={...createInitialState(),subjects:[subject],tasks:[task],risks:[assessment(level)],subjectRisks:batch(level).subjects};
 assert.match(render(SubjectCard,{subject,onOpen:()=>{}},{state}),new RegExp(level,'i'));
 const details=render(SubjectDeadlineList,{tasks:[task],onOpen:()=>{}},{state});
 assert.match(details,/Database exam/);assert.match(details,new RegExp(level,'i'));assert.match(details,/4.0h left/);
});
test('Deadlines uses live capacity and deterministic explanation',()=>{
 const html=render(DeadlinesPage);assert.match(html,/Only 2.0h of capacity/);assert.match(html,/Live backend assessments/);
 assert.doesNotMatch(html,/sample assessment|prototype assessment|CRITICAL/);
});
test('Dashboard replaces unavailable prototype text with live high-risk summary',()=>{
 const html=render(DashboardPage);assert.match(html,/1 high-risk deadlines need attention/);
 assert.doesNotMatch(html,/Risk assessment is not available yet|sample risk/);
});
test('completed tasks and subjects without active work have no active risk; expired data is unavailable',()=>{
 assert.match(render(RiskValue,{assessment:assessment(null)}),/No active risk/);
 const state={...createInitialState(),subjects:[subject],tasks:[],risks:[],subjectRisks:batch(null).subjects};
 assert.match(render(SubjectCard,{subject,onOpen:()=>{}},{state}),/No active risk/);
 assert.match(render(RiskValue,{assessment:{...assessment(),expires_at:'2000-01-01T00:00:00Z'}}),/Risk unavailable/);
});
