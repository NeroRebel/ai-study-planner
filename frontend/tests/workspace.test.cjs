require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {AppDataContext}=require('../src/state/AppDataContext.ts');
const {WorkspaceData}=require('../src/components/settings/WorkspaceData.tsx');
const {createWorkspaceStore,readWorkspaceFile,downloadWorkspace,MAX_WORKSPACE_BYTES}=require('../src/state/workspaceStore.ts');
const {createApi}=require('../src/api/index.ts');
const {ApiError}=require('../src/api/client.ts');
const counts=(values={})=>({subjects:0,tasks:0,availability:0,study_sessions:0,...values});
const doc={format:'ai-study-planner-workspace',version:1,exported_at:'2026-11-19T12:00:00Z',workspace:{subjects:[],tasks:[],availability:[],study_sessions:[]}};
const content=JSON.stringify(doc);
const file=(value=content)=>({name:'qa-workspace.json',size:Buffer.byteLength(value),arrayBuffer:async()=>new TextEncoder().encode(value).buffer});
const preview=(changes={})=>({mode:'MERGE',evaluated_at:'2026-11-19T12:00:00Z',expires_at:'2026-11-19T12:10:00Z',fingerprint:'f'.repeat(64),can_apply:true,additions:counts({subjects:3,tasks:4,availability:7}),existing:counts({tasks:2}),duplicates:counts(),conflicts:[],invalid_rows:[],warnings:[],...changes});
function setup(options={}){
 const calls=[];let refreshed=0;
 const api={export:async()=>{calls.push('export');return options.export?options.export():doc;},
  preview:async command=>{calls.push({preview:command});return options.preview?options.preview(command):preview({mode:command.mode});},
  apply:async command=>{calls.push({apply:command});return options.apply?options.apply(command):{applied:true,imported:counts({subjects:3,tasks:4,availability:7}),duplicates:counts(),conflicts_skipped:0};}};
 const store=createWorkspaceStore(api,async()=>{refreshed++;if(options.refresh)await options.refresh();},value=>calls.push({download:value}));
 return {store,calls,refreshed:()=>refreshed};
}
function render(store){return renderToStaticMarkup(React.createElement(AppDataContext.Provider,{value:{workspace:store.getSnapshot(),workspaceStore:store,pending:false}},React.createElement(WorkspaceData)));}

test('Settings workspace controls expose export and a custom-labelled hidden JSON picker',()=>{
 const {store}=setup(),html=render(store);
 assert.match(html,/Export workspace/);assert.match(html,/Choose JSON file/);assert.match(html,/type="file"/);assert.match(html,/hidden=""/);assert.match(html,/accept=".json,application\/json"/);
 assert.match(html,/Profile, preferences, account credentials and avatars are not included/);
});

test('Export downloads the returned versioned JSON without importing or refreshing planner state',async()=>{
 const {store,calls,refreshed}=setup();await store.export();assert.deepEqual(calls,['export',{download:doc}]);assert.equal(refreshed(),0);assert.match(store.getSnapshot().message,/downloaded/);
});

test('download helper creates a JSON attachment, clicks it and releases the object URL',async t=>{
 const oldWindow=global.window,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 let blob,clicked=0,removed=0,revoked='';const link={click(){clicked++;},remove(){removed++;}};
 global.window={document:{createElement:()=>link,body:{append:()=>{}}}};
 URL.createObjectURL=value=>{blob=value;return 'blob:qa';};URL.revokeObjectURL=value=>{revoked=value;};
 t.after(()=>{global.window=oldWindow;URL.createObjectURL=create;URL.revokeObjectURL=revoke;});
 downloadWorkspace(doc);assert.equal(blob.type,'application/json');assert.deepEqual(JSON.parse(await blob.text()),doc);
 assert.equal(link.download,'ai-study-planner-workspace-2026-11-19.json');assert.equal(clicked,1);assert.equal(removed,1);assert.equal(revoked,'blob:qa');
});

test('file selection retains exact content and preview makes no apply request',async()=>{
 const {store,calls}=setup();const raw='\n'+content+'\n';await store.selectFile(file(raw));assert.equal(store.getSnapshot().fileName,'qa-workspace.json');
 assert.equal(calls.length,0);await store.preview();assert.deepEqual(calls,[{preview:{mode:'MERGE',content:raw}}]);
 assert.match(render(store),/Review Merge import/);assert.match(render(store),/>3<\/dd>/);assert.match(render(store),/>7<\/dd>/);
});

test('Merge applies the reviewed exact content/fingerprint then refreshes shared data and clears the file',async()=>{
 const {store,calls,refreshed}=setup();await store.selectFile(file());await store.preview();await store.apply();
 assert.deepEqual(calls[1].apply,{mode:'MERGE',content,evaluated_at:preview().evaluated_at,fingerprint:preview().fingerprint,confirmation:''});
 assert.equal(refreshed(),1);assert.equal(store.getSnapshot().preview,null);assert.equal(store.getSnapshot().fileName,'');assert.match(store.getSnapshot().message,/14 records/);
 await store.apply();assert.equal(calls.filter(c=>c.apply).length,1);
});

test('Replace requires new preview and exact typed confirmation',async()=>{
 const {store,calls}=setup();await store.selectFile(file());await store.preview();store.setMode('REPLACE');assert.equal(store.getSnapshot().preview,null);
 await store.preview();assert.match(render(store),/Type REPLACE to confirm/);await store.apply();assert.equal(calls.filter(c=>c.apply).length,0);
 store.setConfirmation('replace');await store.apply();assert.equal(calls.filter(c=>c.apply).length,0);
 store.setConfirmation('REPLACE');await store.apply();assert.equal(calls.at(-1).apply.confirmation,'REPLACE');assert.equal(calls.at(-1).apply.mode,'REPLACE');
});

test('conflicts, duplicates, invalid rows and warnings are visible; invalid preview cannot apply',async()=>{
 const {store,calls}=setup({preview:()=>preview({can_apply:false,duplicates:counts({subjects:1}),conflicts:[{entity:'subjects',row:1,code:'subject_name_conflict',message:'Subject name conflict'}],invalid_rows:[{entity:'tasks',row:2,code:'missing_subject',message:'Unknown subject'}],warnings:['No existing data is overwritten.']})});
 await store.selectFile(file());await store.preview();const html=render(store);assert.match(html,/Subject name conflict/);assert.match(html,/Unknown subject/);assert.match(html,/1 duplicate/);assert.match(html,/No existing data/);await store.apply();assert.equal(calls.filter(c=>c.apply).length,0);
});

test('malformed server validation error and oversized/empty files show safe feedback',async()=>{
 await assert.rejects(()=>readWorkspaceFile({size:0,text:async()=>''}),/non-empty/);
 await assert.rejects(()=>readWorkspaceFile({size:MAX_WORKSPACE_BYTES+1,text:async()=>''}),/2 MB/);
 const {store}=setup({preview:()=>{throw new ApiError('Unsupported workspace format/version.',422);}});
 await store.selectFile(file('not JSON'));await store.preview();assert.match(render(store),/Unsupported workspace/);assert.equal(store.getSnapshot().preview,null);
});

test('file selection rejects malformed UTF-8 instead of silently replacing bytes',async()=>{
 const {store,calls}=setup();await store.selectFile({name:'bad-encoding.json',size:2,arrayBuffer:async()=>new Uint8Array([0xff,0xfe]).buffer});
 assert.match(store.getSnapshot().error,/UTF-8/);assert.equal(store.getSnapshot().fileName,'');assert.equal(calls.length,0);
});

test('Cancel clears raw content and preview without persisting anything',async()=>{
 const {store,calls}=setup();await store.selectFile(file());await store.preview();store.cancel();assert.equal(store.getSnapshot().fileName,'');assert.equal(store.getSnapshot().preview,null);await store.preview();assert.equal(calls.length,1);assert.match(store.getSnapshot().error,/Choose/);
});

test('stale preview is discarded and requires a fresh preview instead of blind retry',async()=>{
 const {store,calls}=setup({apply:()=>{throw new ApiError('Workspace changed. Preview again.',409);}});await store.selectFile(file());await store.preview();await store.apply();
 assert.match(render(store),/Workspace changed/);assert.equal(store.getSnapshot().preview,null);await store.apply();assert.equal(calls.filter(c=>c.apply).length,1);
});

test('committed import followed by refresh failure cannot replay writes; refresh has its own retry',async()=>{
 let failed=true;const {store,calls,refreshed}=setup({refresh:async()=>{if(failed)throw new Error('offline');}});await store.selectFile(file());await store.preview();await store.apply();
 assert.equal(store.getSnapshot().refreshFailed,true);assert.match(store.getSnapshot().error,/Import saved/);await store.apply();assert.equal(calls.filter(c=>c.apply).length,1);
 failed=false;await store.retryRefresh();assert.equal(refreshed(),2);assert.equal(store.getSnapshot().refreshFailed,false);
});

test('loading prevents double apply submissions',async()=>{
 let release;const {store,calls}=setup({apply:()=>new Promise(resolve=>release=resolve)});await store.selectFile(file());await store.preview();const first=store.apply();await store.apply();assert.equal(calls.filter(c=>c.apply).length,1);release({applied:true,imported:counts(),duplicates:counts(),conflicts_skipped:0});await first;
});

test('account disposal clears import content/preview and ignores late export or apply results',async()=>{
 let finish;const a=setup({export:()=>new Promise(resolve=>finish=resolve)});const outgoing=a.store.export();a.store.dispose();finish(doc);await outgoing;
 assert.equal(a.calls.filter(c=>c.download).length,0);assert.equal(a.store.getSnapshot().fileName,'');
 let apply;const b=setup({apply:()=>new Promise(resolve=>apply=resolve)});await b.store.selectFile(file());await b.store.preview();const pending=b.store.apply();b.store.dispose();apply({applied:true,imported:counts(),duplicates:counts(),conflicts_skipped:0});await pending;
 assert.equal(b.refreshed(),0);assert.equal(b.store.getSnapshot().preview,null);assert.equal(setup().store.getSnapshot().fileName,'');
});

test('central API uses authenticated endpoints without client ownership fields',async t=>{
 const original=global.fetch,calls=[];t.after(()=>{global.fetch=original;});
 global.fetch=async(url,options)=>{calls.push({url,...options});return Response.json(url.endsWith('/export')?doc:preview());};
 const api=createApi('http://mock.invalid',{getAccessToken:async()=>'test-token'});
 await api.workspace.export();await api.workspace.preview({mode:'MERGE',content});
 assert.equal(calls[0].url,'http://mock.invalid/api/workspace/export');assert.equal(calls[1].headers.Authorization,'Bearer test-token');assert.ok(!('user_id' in JSON.parse(calls[1].body)));
});
