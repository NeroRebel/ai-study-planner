require("./register.cjs");
const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createApi } = require("../src/api/index.ts");
const { createApiClient, ApiError } = require("../src/api/client.ts");
const { createAppDataStore } = require("../src/state/appDataStore.ts");
const { AppDataContext } = require("../src/state/AppDataContext.ts");
const { DataBoundary } = require("../src/components/common/DataBoundary.tsx");
const { RequestError } = require("../src/components/common/RequestError.tsx");
const { mapTask } = require("../src/api/tasks.ts");
const { mapStudySession } = require("../src/api/studySessions.ts");
const { mapAvailability } = require("../src/api/availability.ts");
const { selectSummary } = require("../src/state/selectors.ts");
const { inputToISO, localInput, calendarDate, serializeDeadline } = require("../src/utils/dates.ts");
const { mockAssistantReply } = require("../src/services/mockAssistant.ts");
const json = (value, status=200) => new Response(JSON.stringify(value), {status, headers: {"Content-Type":"application/json"}});
const taskInput = {title:"Research",description:"",subject_id:"subject-uuid",deadline:"2099-01-05T22:59:00Z",
  estimated_hours:5,progress:0,priority:"HIGH",difficulty:"HARD",status:"TODO"};

function mockServer(t) {
  const original = global.fetch;
  const entities = {subjects:[],tasks:[],availability:[],"study-sessions":[]};
  const calls = [];
  let fail = null, counter=0;
  global.fetch = async (url, options={}) => {
    calls.push({url, ...options});
    if (fail) return fail(url,options);
    const parsed = new URL(url), [group,id] = parsed.pathname.slice(5).split("/");
    const method = options.method || "GET", data = options.body && JSON.parse(options.body);
    const list = entities[group];
    if (method === "GET") return id ? json(list.find(item => item.id === id)) :
      json(list.slice(Number(parsed.searchParams.get("offset") || 0), Number(parsed.searchParams.get("offset") || 0)+500));
    if (method === "DELETE") {entities[group]=list.filter(item => item.id !== id);return new Response(null,{status:204});}
    if (method === "POST") {
      const value = {...data, id:"server-uuid-"+(++counter)};
      if (group === "tasks") Object.assign(value,{remaining_hours:data.estimated_hours,created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z"});
      if (group === "study-sessions") Object.assign(value,{planned_minutes:60});
      list.push(value);
      return json(value,201);
    }
    const value = list.find(item => item.id === id);
    Object.assign(value,data);
    if (group === "tasks") {
      if (data.status === "COMPLETED") {
        value.progress=100;value.remaining_hours=0;
        entities["study-sessions"]=entities["study-sessions"].filter(session => session.task_id !== id);
      } else if (data.progress !== undefined) value.remaining_hours=value.estimated_hours*(1-data.progress/100);
    }
    return json(value);
  };
  t.after(() => {global.fetch=original;});
  return {entities,calls,setFailure: value => {fail=value;}};
}
const store = () => createAppDataStore(createApi("http://mock.invalid"));

test("loads the four collections once in parallel, deduplicates initialization, and starts empty",async t => {
  const server=mockServer(t), state=store();
  assert.equal(state.getSnapshot().status,"loading");
  assert.deepEqual(state.getSnapshot().state.tasks,[]);
  let notices=0;const unsubscribe=state.subscribe(()=>notices++);
  await Promise.all([state.load(),state.load()]);
  assert.equal(server.calls.length,4);
  assert.equal(state.getSnapshot().status,"ready");
  assert.deepEqual(state.getSnapshot().state.risks,[]);
  assert.ok(notices);unsubscribe();
});
test("API read mapping preserves local dates and normalizes seconds and instants",()=>{
  assert.equal(mapAvailability({date:"2099-01-05",start_time:"17:00:00",end_time:"19:00:00"}).start_time,"17:00");
  assert.equal(mapStudySession({date:"2099-01-05",start_time:"17:00:00",end_time:"18:00:00"}).date,"2099-01-05");
  assert.equal(mapTask({...taskInput,deadline:"2099-01-05T23:59:00+01:00"}).deadline,"2099-01-05T22:59:00.000Z");
});
test("all core writes survive reloading through a new store and task progress stays server-owned",async t=>{
  const server=mockServer(t), first=store();await first.load();
  assert.equal(await first.dispatch({type:"save-subject",input:{name:"Databases",description:"",color:"gold"}}),null);
  const subject=first.getSnapshot().state.subjects[0];
  assert.match(subject.id,/server-uuid/);
  assert.equal(await first.dispatch({type:"save-task",id:"new",input:{...taskInput,subject_id:subject.id}}),null);
  const task=first.getSnapshot().state.tasks[0];
  assert.equal(await first.dispatch({type:"save-task",id:task.id,input:{...task,progress:40}}),null);
  const patch=server.calls.find(call=>call.method==="PATCH");
  assert.deepEqual(JSON.parse(patch.body),{progress:40});
  await first.dispatch({type:"save-availability",window:{id:"new",date:"2099-01-05",start_time:"17:00",end_time:"19:00"}});
  await first.dispatch({type:"save-session",id:"new",input:{task_id:task.id,date:"2099-01-05",
    start_time:"17:00",end_time:"18:00",status:"PLANNED",completed_minutes:0}});
  const reloaded=store();await reloaded.load();
  assert.equal(reloaded.getSnapshot().state.subjects[0].id,subject.id);
  assert.equal(reloaded.getSnapshot().state.tasks[0].progress,40);
  assert.equal(reloaded.getSnapshot().state.tasks[0].remaining_hours,3);
  assert.equal(reloaded.getSnapshot().state.availability.length,1);
  assert.equal(reloaded.getSnapshot().state.sessions.length,1);
  await reloaded.dispatch({type:"complete-task",id:task.id});
  assert.equal(reloaded.getSnapshot().state.tasks[0].progress,100);
  assert.equal(reloaded.getSnapshot().state.sessions.length,0);
});
test("backend conflict feedback is displayed and rejected writes leave the loaded state intact",async t=>{
  const server=mockServer(t), state=store();await state.load();
  server.setFailure(()=>json({detail:"Study session overlaps an existing session."},409));
  const result=await state.dispatch({type:"save-session",id:"new",input:{}});
  assert.match(result,/overlaps/);
  assert.deepEqual(state.getSnapshot().state.sessions,[]);
  assert.equal(state.getSnapshot().pending,false);
  const html=renderToStaticMarkup(React.createElement(RequestError,{message:state.getSnapshot().mutationError}));
  assert.match(html,/role="alert"/);assert.match(html,/Study session overlaps/);
});
test("network loading failure is recoverable without substituting fixtures",async t=>{
  const server=mockServer(t);server.setFailure(()=>{throw new TypeError("private network trace");});
  const state=store();await state.load();
  assert.equal(state.getSnapshot().status,"error");
  assert.match(state.getSnapshot().error,/Cannot reach/);
  assert.ok(!state.getSnapshot().error.includes("private"));
  server.setFailure(null);await state.load();
  assert.equal(state.getSnapshot().status,"ready");
});
test("a committed write followed by failed refresh is not falsely offered as a failed POST",async t=>{
  const server=mockServer(t), state=store();await state.load();
  const original=global.fetch;
  global.fetch=async(url, options)=>{
    const response=await original(url,options);
    if(options?.method==="POST") server.setFailure(()=>json({},503));
    return response;
  };
  assert.equal(await state.dispatch({type:"save-subject",input:{name:"Saved",description:"",color:"blue"}}),null);
  assert.equal(state.getSnapshot().status,"error");
  server.setFailure(null);await state.load();
  assert.equal(state.getSnapshot().state.subjects.length,1);
  assert.equal(server.calls.filter(call=>call.method==="POST").length,1);
});
test("client handles 400, 404, 409, 422, network, 5xx and no-content safely",async t=>{
  const server=mockServer(t), client=createApiClient("http://mock.invalid/");
  for (const status of [400,404,409,422,500]) {
    server.setFailure(()=>json({detail:status===500?"private stack trace":"Action rejected."},status));
    await assert.rejects(()=>client.request("/api/subjects"),error=>{
      assert.ok(error instanceof ApiError);assert.equal(error.status,status);
      assert.ok(!error.message.includes("private"));return true;
    });
  }
  server.setFailure(()=>json({detail:"Request validation failed.",errors:[{loc:["body","title"],msg:"Field required"}]},422));
  await assert.rejects(()=>client.request("/api/tasks"),/title: Field required/);
  server.setFailure(()=>new Response(null,{status:204}));
  assert.equal(await client.request("/api/tasks/id","DELETE"),undefined);
  server.setFailure(()=>{throw new TypeError("offline");});
  await assert.rejects(()=>client.request("/api/tasks"),/Cannot reach/);
});
test("list pagination fetches the full collection rather than only the backend default page",async t=>{
  const server=mockServer(t);
  server.entities.subjects=Array.from({length:501},(_,i)=>({id:String(i),name:"Subject "+i,color:null}));
  const rows=await createApi("http://mock.invalid").subjects.list();
  assert.equal(rows.length,501);assert.equal(server.calls.length,2);
});
test("loading, error/retry and ready states render using the existing empty-state UI",()=>{
  for(const status of ["loading","error","ready"]) {
    const html=renderToStaticMarkup(React.createElement(AppDataContext.Provider,{
      value:{status,error:"Cannot reach the study server.",retry:()=>{}}
    },React.createElement(DataBoundary,null,React.createElement("p",null,"Loaded content"))));
    assert.match(html,status==="loading"?/Loading your workspace/:status==="error"?/Retry loading/:/Loaded content/);
  }
});
test("Budapest deadline serialization handles winter, summer, midnight and both DST edge cases",()=>{
  assert.equal(serializeDeadline("2026-11-20T00:15", "2026-11-19T23:15:42.123Z"), "2026-11-19T23:15:42.123Z");
  assert.equal(inputToISO("2026-11-20T00:15"),"2026-11-19T23:15:00.000Z");
  assert.equal(calendarDate("2026-11-19T23:15:00Z"),"2026-11-20");
  assert.equal(localInput(inputToISO("2026-07-15T19:00")),"2026-07-15T19:00");
  assert.equal(inputToISO("2026-07-15T19:00"),"2026-07-15T17:00:00.000Z");
  assert.equal(inputToISO("2026-03-29T02:30"),"");
  assert.equal(inputToISO("2026-10-25T02:30"),"");
});
test("dashboard summaries use local deadline dates, persisted effort and selected reporting week",async t=>{
  const server=mockServer(t);
  server.entities.tasks=[{...taskInput,id:"task-uuid",deadline:"2026-11-19T23:15:00Z",estimated_hours:4,remaining_hours:3,progress:25}];
  server.entities["study-sessions"]=[{id:"session-uuid",task_id:"task-uuid",date:"2026-11-20",start_time:"17:00:00",
    end_time:"18:00:00",planned_minutes:60,completed_minutes:30,status:"PARTIALLY_COMPLETED"}];
  const state=store();await state.load();const summary=selectSummary(state.getSnapshot().state,"2026-11-20");
  assert.equal(summary.upcomingDeadlines,1);assert.equal(summary.overallProgress,25);
  assert.equal(summary.reportedHours,.5);assert.equal(summary.plannedHours,1);
});
test("scripted assistant resolves subjects by persisted UUID and never mutates entities",async t=>{
  const server=mockServer(t);
  server.entities.subjects=[{id:"subject-uuid",name:"Databases"}];
  server.entities.tasks=[{...taskInput,id:"task-uuid",remaining_hours:3,progress:40}];
  const state=store();await state.load();const before=JSON.stringify(state.getSnapshot().state);
  assert.match(mockAssistantReply(state.getSnapshot().state,"I did not finish my Database task today"),/Research.*3h remaining/);
  assert.match(mockAssistantReply(state.getSnapshot().state,"Which deadline is risky?"),/no assessed active tasks/);
  assert.equal(JSON.stringify(state.getSnapshot().state),before);
});

test("task estimate edits and session outcomes send only writable backend inputs",async t=>{
  const server=mockServer(t);
  server.entities.tasks=[{...taskInput,id:"task-uuid",progress:40,estimated_hours:5,remaining_hours:3}];
  const state=store();await state.load();
  const task=state.getSnapshot().state.tasks[0];
  await state.dispatch({type:"save-task",id:task.id,input:{...task,estimated_hours:10}});
  assert.deepEqual(JSON.parse(server.calls.find(call=>call.method==="PATCH").body),{estimated_hours:10});
  await state.dispatch({type:"save-session",id:"new",input:{id:"ignored",planned_minutes:999,
    task_id:task.id,date:"2000-01-03",start_time:"09:00",end_time:"10:00",
    status:"PARTIALLY_COMPLETED",completed_minutes:30,task_remaining_hours:2}});
  const payload=JSON.parse(server.calls.filter(call=>call.method==="POST").at(-1).body);
  assert.equal(payload.task_remaining_hours,2);assert.equal(payload.completed_minutes,30);
  assert.equal(payload.status,"PARTIALLY_COMPLETED");
  assert.ok(!("planned_minutes" in payload));assert.ok(!("id" in payload));
});
test("network-rejected writes keep the existing entities and return actionable feedback",async t=>{
  const server=mockServer(t),state=store();await state.load();
  server.setFailure(()=>{throw new TypeError("socket details");});
  const result=await state.dispatch({type:"save-subject",input:{name:"Keep form",description:"",color:null}});
  assert.match(result,/Cannot reach/);assert.equal(state.getSnapshot().state.subjects.length,0);
  assert.equal(state.getSnapshot().pending,false);
});
