require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server'),{MemoryRouter}=require('react-router-dom');
const {AuthContext}=require('../src/auth/AuthContext.ts'),{createAuthStore}=require('../src/auth/authStore.ts');
const {OnboardingGate}=require('../src/onboarding/OnboardingGate.tsx'),{OnboardingPage}=require('../src/onboarding/OnboardingPage.tsx');
const {SelectableChip}=require('../src/components/common/SelectableChip.tsx');
const {setupDraft,stepPayload,validateSetup,addCustomInterest}=require('../src/onboarding/model.ts');
const base=id=>({user_id:id,display_name:'Student '+id,avatar_path:null,timezone:'Europe/Budapest',university:null,study_program:null,study_level:null,study_year:null,weekly_study_hours:null,preferred_session_minutes:null,preferred_study_period:null,preferred_study_days:[],interests:[],goals:[],onboarding_step:1,onboarding_completed:false,onboarding_completed_at:null,onboarding_skipped:false,onboarding_start_mode:null});
const session=id=>({user:{id,email:id+'@example.test'},access_token:'token-'+id});
function render(Component,props={},value={},route='/onboarding') {return renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[route]},React.createElement(AuthContext.Provider,{value:{session:session('A'),profile:base('A'),actions:null,profileLoading:false,error:'',...value}},React.createElement(Component,props))));}
function setup(t){
 const before=global.fetch,calls=[];let current=session('A'),callback=()=>{},delay=null;const profiles=new Map([['A',base('A')],['B',base('B')]]);
 global.fetch=async(url,options={})=>{
  calls.push({url,...options});if(delay)return delay(url,options);
  const row=profiles.get(current.user.id),values=options.body?JSON.parse(options.body):{};
  if(url.endsWith('/complete')){Object.assign(row,{onboarding_completed:true,onboarding_skipped:values.skip,onboarding_start_mode:values.start_mode});return Response.json({profile:row,created_subjects:[]});}
  if(options.method==='PATCH')Object.assign(row,values);
  return Response.json(row);
 };
 const client={auth:{getSession:async()=>({data:{session:current},error:null}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>({error:null})}};
 const store=createAuthStore(client,'http://mock.invalid','http://localhost:5173');t.after(()=>{global.fetch=before;store.dispose();});
 return {store,calls,profiles,delay:fn=>delay=fn,switch:id=>{current=session(id);callback('SIGNED_IN',current);}};
}
test('profile loading gates the workspace before onboarding status is known',()=>{
 const html=render(OnboardingGate,{children:'PRIVATE PLANNER'},{profile:null,profileLoading:true});assert.match(html,/Checking your saved setup/);assert.doesNotMatch(html,/PRIVATE PLANNER/);
});
test('new profile reaches onboarding while completed profile bypasses it',()=>{
 assert.match(render(OnboardingGate,{children:'PRIVATE PLANNER'}),/Tell us a little about you/);
 assert.doesNotMatch(render(OnboardingGate,{children:'PRIVATE PLANNER'},{},'/tasks'),/PRIVATE PLANNER/);
 assert.match(render(OnboardingGate,{children:'PRIVATE PLANNER'},{profile:{...base('A'),onboarding_completed:true}},'/tasks'),/PRIVATE PLANNER/);
});
test('a mismatched account profile cannot flash old onboarding or planner data',()=>{
 const html=render(OnboardingGate,{children:'PRIVATE PLANNER'},{session:session('B'),profile:{...base('A'),study_program:'PRIVATE MAJOR'}});
 assert.doesNotMatch(html,/PRIVATE MAJOR|PRIVATE PLANNER|Tell us a little/);assert.match(html,/Loading your workspace/);
});
test('profile loading failure has retry and never opens protected data',()=>{
 const html=render(OnboardingGate,{children:'PRIVATE PLANNER'},{profile:null,error:'Cannot load profile'});assert.match(html,/Retry profile/);assert.match(html,/Cannot load profile/);assert.doesNotMatch(html,/PRIVATE PLANNER/);
});
test('each saved wizard step has a distinct task and Back/Continue controls',()=>{
 const labels=['Tell us a little','What are you studying','Find your study rhythm','What would you like to achieve','How would you like to start'];
 for(let i=1;i<=5;i++){const html=render(OnboardingPage,{}, {profile:{...base('A'),onboarding_step:i}});assert.ok(html.includes(labels[i-1]));assert.ok(html.includes(`Step ${i} of 5`));assert.match(html,/>Back<|Back<\/button>/);assert.match(html,/Skip for now/);}
});
test('onboarding draft restores server data without requiring private academic details',()=>{
 const draft=setupDraft({...base('A'),university:'Saved uni',interests:[{name:'Statistics',type:'subject'}],weekly_study_hours:20});
 assert.equal(draft.university,'Saved uni');assert.equal(draft.weekly_study_hours,20);assert.equal(draft.interests[0].name,'Statistics');
 assert.equal(validateSetup(setupDraft(base('A')),1),'');
});
test('study-year and target validation allow bounded values and reject invalid data',()=>{
 const draft=setupDraft(base('A'));assert.match(validateSetup({...draft,study_year:'13'},1),/1 to 12/);assert.match(validateSetup({...draft,study_year:'1.5'},1),/1 to 12/);
 assert.match(validateSetup({...draft,weekly_study_hours:0},3),/1 to 80/);assert.equal(validateSetup({...draft,weekly_study_hours:80},3),'');
});
test('selectable chip exposes keyboard button semantics, selected and disabled states',()=>{
 let selected=false;const element=SelectableChip({label:'Statistics',selected:false,onChange:()=>selected=true});element.props.onClick();assert.equal(selected,true);
 const html=render(SelectableChip,{label:'Statistics',selected:true,disabled:true,onChange:()=>{}});assert.match(html,/type="button"/);assert.match(html,/aria-pressed="true"/);assert.match(html,/disabled=""/);
});
test('custom interests trim names and reject blanks, duplicates and excessive length',()=>{
 const list=addCustomInterest([],'  Robotics  ','subject');assert.equal(list[0].name,'Robotics');
 assert.throws(()=>addCustomInterest(list,'robotics','skill'),/already selected/);assert.throws(()=>addCustomInterest([],' ','subject'));assert.throws(()=>addCustomInterest([],'x'.repeat(81),'subject'));
});
test('step payloads contain only the intended profile fields and next resume step',()=>{
 const draft=setupDraft(base('A'));draft.study_year='2';draft.goals=['Pass exams'];
 assert.equal(stepPayload(draft,1).study_year,2);assert.equal(stepPayload(draft,1).university,null);assert.equal(stepPayload(draft,2).onboarding_step,3);
 assert.deepEqual(stepPayload(draft,4),{goals:['Pass exams'],onboarding_step:5});assert.ok(!('onboarding_completed' in stepPayload(draft,4)));
});
test('start step offers manual/AI modes and unchecked explicit subject approval',()=>{
 const html=render(OnboardingPage,{}, {profile:{...base('A'),onboarding_step:5,interests:[{name:'Statistics',type:'subject'},{name:'Programming',type:'skill'}]}});
 assert.match(html,/Let AI help set up my workspace/);assert.match(html,/I&#x27;ll set it up myself/);assert.match(html,/Add these subjects to my workspace/);assert.match(html,/Skills remain interests/);
 const checkbox=html.match(/<input[^>]*type="checkbox"[^>]*>/)[0];assert.doesNotMatch(checkbox,/checked/);
});
test('preferences/goals render real selectable choices and save in the owned profile',async t=>{
 const {store,calls}=setup(t);await store.initialize();await store.refreshProfile();await store.updateProfile({preferred_session_minutes:45,weekly_study_hours:15,goals:['Pass exams'],onboarding_step:4});
 assert.equal(store.getSnapshot().profile.onboarding_step,4);assert.equal(store.getSnapshot().profile.preferred_session_minutes,45);
 const body=JSON.parse(calls.find(c=>c.method==='PATCH').body);assert.deepEqual(body.goals,['Pass exams']);assert.ok(!('user_id' in body));
});
test('manual completion uses structured consent and persists completion across profile refresh',async t=>{
 const {store,calls}=setup(t);await store.initialize();await store.refreshProfile();await store.completeOnboarding({start_mode:'manual',create_subjects:true,skip:false});await store.refreshProfile();
 assert.equal(store.getSnapshot().profile.onboarding_completed,true);assert.equal(store.getSnapshot().profile.onboarding_start_mode,'manual');
 assert.deepEqual(JSON.parse(calls.find(c=>c.url.endsWith('/complete')).body),{start_mode:'manual',create_subjects:true,skip:false});
});
test('AI-assisted completion records choice without sending an LLM request or planner mutation',async t=>{
 const {store,calls}=setup(t);await store.initialize();await store.refreshProfile();await store.completeOnboarding({start_mode:'ai',create_subjects:false,skip:false});
 assert.equal(store.getSnapshot().profile.onboarding_start_mode,'ai');assert.equal(calls.filter(c=>c.url.includes('/assistant')||c.url.includes('/planner')).length,0);
});
test('skip completes setup without subject creation and remains saved after reload',async t=>{
 const {store}=setup(t);await store.initialize();await store.refreshProfile();await store.completeOnboarding({start_mode:'manual',create_subjects:false,skip:true});await store.refreshProfile();assert.equal(store.getSnapshot().profile.onboarding_skipped,true);
});
test('late onboarding completion cannot publish into another account',async t=>{
 const s=setup(t);await s.store.initialize();await s.store.refreshProfile();let release;s.delay(()=>new Promise(resolve=>release=resolve));
 const pending=s.store.completeOnboarding({start_mode:'manual',create_subjects:false,skip:false});await new Promise(r=>setTimeout(r,0));s.switch('B');release(Response.json({profile:{...base('A'),onboarding_completed:true}}));
 await assert.rejects(pending,/account changed/);assert.equal(s.store.getSnapshot().session.user.id,'B');assert.equal(s.store.getSnapshot().profile,null);
});
test('failed completion preserves incomplete profile and exposes backend error',async t=>{
 const s=setup(t);await s.store.initialize();await s.store.refreshProfile();s.delay(()=>Response.json({detail:'Could not save setup'},{status:409}));await assert.rejects(s.store.completeOnboarding({start_mode:'manual',create_subjects:true,skip:false}),/Could not save setup/);assert.equal(s.store.getSnapshot().profile.onboarding_completed,false);
});
