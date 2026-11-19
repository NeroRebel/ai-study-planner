require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {AppDataContext}=require('../src/state/AppDataContext.ts');
const {createInitialState,isActive}=require('../src/state/appState.ts');
const {createAppDataStore}=require('../src/state/appDataStore.ts');
const {selectSummary}=require('../src/state/selectors.ts');
const {TasksPage}=require('../src/pages/TasksPage.tsx');
const {TaskDialog}=require('../src/components/tasks/TaskDialog.tsx');
const {ReopenTaskButton}=require('../src/components/tasks/ReopenTaskButton.tsx');
const {ApiError}=require('../src/api/client.ts');

const subject={id:'subject-a',name:'Databases',description:'',color:'gold'};
const completed={id:'task-a',subject_id:subject.id,title:'Database assignment',description:'Saved work',deadline:'2099-01-05T18:00:00Z',estimated_hours:5,remaining_hours:0,progress:100,status:'COMPLETED',priority:'HIGH',difficulty:'MEDIUM'};
const history={id:'history-a',task_id:completed.id,date:'2020-01-05',start_time:'09:00',end_time:'10:00',planned_minutes:60,completed_minutes:60,status:'COMPLETED'};
function render(Component,props={},snapshot={}){
 const state={...createInitialState(),subjects:[subject],tasks:[completed],sessions:[history],...snapshot.state};
 const value={state,dispatch:async()=>null,openTask:()=>{},pending:false,riskStatus:'ready',...snapshot};
 return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AppDataContext.Provider,{value},React.createElement(Component,props))));
}
function setup(update){
 let task={...completed};const calls=[];
 const api={subjects:{list:async()=>{calls.push('subjects');return [subject];}},
  tasks:{list:async()=>{calls.push('tasks');return [{...task}];},update:async(id,values)=>{calls.push({id,values});if(update)await update();task={...task,...values};return {...task};}},
  availability:{list:async()=>{calls.push('availability');return [];}},
  sessions:{list:async()=>{calls.push('sessions');return [{...history}];}},
  risks:{read:async()=>{calls.push('risks');return {tasks:[],subjects:[],expires_at:'2099-01-01T00:00:00Z'};}}};
 return {store:createAppDataStore(api),calls};
}

test('completed task has an explicit Reopen action on desktop, mobile card and details',()=>{
 const html=render(TasksPage);assert.match(html,/Reopen task: Database assignment/);assert.match(html,/Reopen task<\/button>/);assert.match(html,/100%/);
 assert.match(render(TaskDialog,{id:completed.id}),/Reopen task<\/button>/);
});

test('Reopen is hidden for active/cancelled tasks and disabled while saving',()=>{
 for(const status of ['TODO','IN_PROGRESS','CANCELLED'])assert.equal(render(ReopenTaskButton,{task:{...completed,status}}),'');
 assert.match(render(ReopenTaskButton,{task:completed},{pending:true}),/disabled=""/);
});

test('reopening sends only status, refreshes shared views/risks and keeps visible progress/history',async()=>{
 const {store,calls}=setup();await store.load();
 const before=structuredClone(store.getSnapshot().state.sessions);
 assert.equal(selectSummary(store.getSnapshot().state).completedTasks,1);
 assert.equal(await store.dispatch({type:'reopen-task',id:completed.id}),null);
 const snapshot=store.getSnapshot(),task=snapshot.state.tasks[0];
 assert.deepEqual(calls.find(item=>typeof item==='object'),{id:completed.id,values:{status:'IN_PROGRESS'}});
 assert.equal(task.progress,100);assert.equal(task.remaining_hours,0);assert.equal(isActive(task),true);
 assert.equal(snapshot.state.tasks.filter(isActive).length,1);
 assert.deepEqual(snapshot.state.sessions,before);
 assert.equal(selectSummary(snapshot.state).completedTasks,0);
 assert.equal(snapshot.riskStatus,'ready');
 for(const collection of ['subjects','tasks','availability','sessions','risks'])assert.equal(calls.filter(item=>item===collection).length,2);
 const html=render(TasksPage,{},snapshot);assert.match(html,/In progress/);assert.match(html,/100%/);assert.doesNotMatch(html,/Reopen task<\/button>/);
 const reload=await store.load();assert.equal(reload,undefined);assert.equal(store.getSnapshot().state.tasks[0].status,'IN_PROGRESS');
});

test('failed reopen retains completion, progress and history and returns useful feedback',async()=>{
 const {store}=setup(async()=>{throw new ApiError('Cannot update this task.',409);});await store.load();
 assert.equal(await store.dispatch({type:'reopen-task',id:completed.id}),'Cannot update this task.');
 const snapshot=store.getSnapshot();assert.equal(snapshot.state.tasks[0].status,'COMPLETED');assert.equal(snapshot.state.tasks[0].progress,100);
 assert.deepEqual(snapshot.state.sessions,[history]);assert.equal(snapshot.pending,false);
 assert.match(render(TasksPage,{},snapshot),/Reopen task<\/button>/);
});

test('pending reopen prevents duplicate mutation submissions',async()=>{
 let release;const {store,calls}=setup(()=>new Promise(resolve=>release=resolve));await store.load();
 const first=store.dispatch({type:'reopen-task',id:completed.id});
 assert.match(await store.dispatch({type:'reopen-task',id:completed.id}),/wait/);
 assert.equal(calls.filter(item=>typeof item==='object').length,1);
 release();await first;assert.equal(store.getSnapshot().state.tasks[0].status,'IN_PROGRESS');
});
