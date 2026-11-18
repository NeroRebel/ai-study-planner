require("./register.cjs");
const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createApi } = require("../src/api/index.ts");
const { createAppDataStore } = require("../src/state/appDataStore.ts");
const { AppDataContext } = require("../src/state/AppDataContext.ts");
const { WeeklyPlanner } = require("../src/components/calendar/WeeklyPlanner.tsx");
const { PlannerFeedback } = require("../src/components/calendar/PlannerFeedback.tsx");
const { currentWeek, addDays } = require("../src/utils/dates.ts");

const range = () => ({date_from:currentWeek(),date_to:addDays(currentWeek(),6)});
const session = () => ({id:"generated-id",task_id:"task-id",date:currentWeek(),start_time:"17:00:00",
  end_time:"18:00:00",planned_minutes:60,completed_minutes:0,status:"PLANNED"});
const result = () => ({...range(),algorithm_version:"greedy-v1",evaluated_at:"2026-11-17T10:00:00Z",
  timezone:"Europe/Budapest",sessions_created:[session()],created_count:1,tasks_fully_scheduled:1,
  tasks_partially_scheduled:0,tasks_unscheduled:0,tasks_skipped:0,unscheduled_minutes:0,tasks:[],warnings:[]});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});

async function setup(t, generate) {
  const before=global.fetch,calls=[];
  let sessions=[],failRefresh=false;
  global.fetch=async(url,options={})=>{
    calls.push({url,...options});
    if(options.method==="POST") {
      const response=await generate(url,options);
      if(response.ok) {
        const value=await response.clone().json();
        sessions=value.sessions_created;
      }
      return response;
    }
    if(failRefresh)throw new TypeError("offline");
    if(url.includes("/api/risks"))return json({tasks:[],subjects:[],evaluated_at:"2026-11-17T10:00:00Z",expires_at:"2099-01-01T00:00:00Z"});
    return json(url.includes("/study-sessions")?sessions:[]);
  };
  t.after(()=>{global.fetch=before;});
  const store=createAppDataStore(createApi("http://mock.invalid"));
  await store.load();
  return {store,calls,failRefresh:value=>{failRefresh=value;}};
}
const renderPlanner=(store)=>renderToStaticMarkup(React.createElement(AppDataContext.Provider,{
  value:{...store.getSnapshot(),openSession:()=>{},generatePlan:store.generatePlan},
},React.createElement(WeeklyPlanner,{expanded:true})));

test("Generate plan posts the selected interval, then refreshes persisted sessions",async t=>{
  const {store,calls}=await setup(t,async()=>json(result()));
  await store.generatePlan(range());
  const post=calls.find(call=>call.method==="POST");
  assert.equal(post.url,"http://mock.invalid/api/planner/generate");
  assert.deepEqual(JSON.parse(post.body),range());
  assert.equal(calls.filter(call=>call.method==="POST").length,1);
  assert.equal(calls.filter(call=>call.url.includes("/study-sessions")).length,2);
  assert.equal(store.getSnapshot().state.sessions[0].id,"generated-id");
  assert.equal(store.getSnapshot().state.sessions[0].start_time,"17:00");
  assert.equal(store.getSnapshot().generationResult.created_count,1);
  assert.equal(store.getSnapshot().generating,false);
  assert.match(renderPlanner(store),/Study plan generated: 1 session created/);
});
test("generation loading disables the action and duplicate requests share no second POST",async t=>{
  let release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const {store,calls}=await setup(t,()=>blocked);
  const first=store.generatePlan(range());
  assert.equal(store.getSnapshot().generating,true);
  assert.equal(store.getSnapshot().pending,true);
  const html=renderPlanner(store);
  assert.match(html,/disabled=""[^>]*>Generating study plan/);
  await store.generatePlan(range());
  assert.equal(calls.filter(call=>call.method==="POST").length,1);
  release(json(result()));
  await first;
  assert.equal(store.getSnapshot().pending,false);
});
test("partial plans are successful responses with warnings and remaining effort, not request errors",async t=>{
  const partial={...result(),tasks_fully_scheduled:0,tasks_partially_scheduled:1,tasks_unscheduled:1,
    unscheduled_minutes:180,tasks:[
      {task_id:"task-id",outcome:"PARTIALLY_SCHEDULED",unscheduled_minutes:60,reasons:["INSUFFICIENT_FREE_TIME"]},
      {task_id:"other-id",outcome:"UNSCHEDULED",unscheduled_minutes:120,reasons:["DEADLINE_PASSED"]},
    ]};
  const {store}=await setup(t,async()=>json(partial));
  await store.generatePlan(range());
  assert.equal(store.getSnapshot().generationError,"");
  assert.equal(store.getSnapshot().state.sessions.length,1);
  const html=renderPlanner(store);
  assert.match(html,/2 tasks could not be fully scheduled/);
  assert.match(html,/180 minutes remain unscheduled/);
  assert.match(html,/Deadline has passed/);
  assert.match(html,/role="alert"/);
});
test("backend validation errors display without replacing the existing calendar",async t=>{
  const {store}=await setup(t,async()=>json({detail:"Choose an inclusive planning range of 1–31 days."},422));
  const before=store.getSnapshot().state;
  await store.generatePlan(range());
  assert.equal(store.getSnapshot().state.sessions,before.sessions);
  assert.equal(store.getSnapshot().state.tasks,before.tasks);
  assert.equal(store.getSnapshot().generationResult,null);
  assert.match(renderPlanner(store),/planning range/);
  assert.equal(store.getSnapshot().pending,false);
});
test("network errors are actionable and generation can be retried safely",async t=>{
  let fail=true;
  const {store}=await setup(t,async()=>{if(fail)throw new TypeError("private trace");return json(result());});
  await store.generatePlan(range());
  assert.match(renderPlanner(store),/Cannot reach the study server/);
  assert.ok(!renderPlanner(store).includes("private trace"));
  fail=false;
  await store.generatePlan(range());
  assert.equal(store.getSnapshot().generationError,"");
  assert.equal(store.getSnapshot().state.sessions.length,1);
});
test("generation result survives a failed refresh; retrying data load never repeats generation",async t=>{
  let scope;
  scope=await setup(t,async()=>{scope.failRefresh(true);return json(result());});
  await scope.store.generatePlan(range());
  assert.equal(scope.store.getSnapshot().status,"error");
  assert.equal(scope.store.getSnapshot().generationResult.created_count,1);
  scope.failRefresh(false);await scope.store.load();
  assert.equal(scope.store.getSnapshot().state.sessions.length,1);
  assert.equal(scope.calls.filter(call=>call.method==="POST").length,1);
});
test("no-op repeat generation and skipped invalid data have honest feedback",()=>{
  const noop={...result(),created_count:0,sessions_created:[]};
  let html=renderToStaticMarkup(React.createElement(PlannerFeedback,{result:noop,error:"",tasks:[]}));
  assert.match(html,/0 sessions created/);
  assert.match(html,/No additional blocks are needed/);
  const invalid={...noop,tasks_skipped:1,tasks:[{task_id:"invalid",outcome:"SKIPPED",
    unscheduled_minutes:null,reasons:["INVALID_TASK_DATA"]}]};
  html=renderToStaticMarkup(React.createElement(PlannerFeedback,{result:invalid,error:"",tasks:[]}));
  assert.match(html,/1 task could not be fully scheduled/);
  assert.match(html,/Unknown effort/);
});