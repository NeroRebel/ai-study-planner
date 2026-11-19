require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {createAuthStore,authMessage}=require('../src/auth/authStore.ts');
const {AuthContext}=require('../src/auth/AuthContext.ts');
const {AuthGate}=require('../src/auth/AuthGate.tsx');
const {AuthPage}=require('../src/auth/AuthPage.tsx');
const {ProfilePanel}=require('../src/auth/ProfilePanel.tsx');
const {AccountSecurity}=require('../src/auth/AccountSecurity.tsx');
const {createApiClient}=require('../src/api/client.ts');
const {validateAvatar,replaceAvatar,removeAvatar}=require('../src/auth/avatars.ts');
const {createAppDataStore}=require('../src/state/appDataStore.ts');
const {createApi}=require('../src/api/index.ts');
const session=id=>({user:{id,email:id+'@example.test'},access_token:'token-'+id});
const profile=id=>({user_id:id,display_name:'Student '+id,avatar_path:null,timezone:'Europe/Budapest'});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function setup(t,initial=null){
 let current=initial,callback=()=>{};const calls=[];let fail=null;
 const before=global.fetch;
 global.fetch=async(url,options={})=>{
  calls.push({url,...options});if(fail)return fail(url,options);
  if(options.method==='DELETE')return new Response(null,{status:204});
  if(options.method==='PATCH')return json({...profile(current.user.id),...JSON.parse(options.body)});
  return json(profile(current.user.id));
 };
 const client={auth:{
  getSession:async()=>({data:{session:current},error:null}),
  onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe:()=>calls.push('unsubscribe')}}};},
  signInWithPassword:async({email,password})=>{
   if(password==='wrong')return {error:new Error('Invalid login credentials')};
   current=session(email);callback('SIGNED_IN',current);return {data:{session:current},error:null};
  },
  signUp:async args=>{calls.push({signup:args});return {data:{session:null},error:null};},
  signOut:async()=>{current=null;callback('SIGNED_OUT',null);return {error:null};},
  resetPasswordForEmail:async(email,options)=>{calls.push({recover:email,options});return {error:null};},
  updateUser:async args=>{calls.push({password:args});return {error:null};},
  signInWithOAuth:async args=>{calls.push({oauth:args});return {error:null};},
 },storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://storage.example.test/signed-avatar'},error:null})})}};
 const store=createAuthStore(client,'http://mock.invalid','http://localhost:5173');
 t.after(()=>{store.dispose();global.fetch=before;});
 return {store,calls,client,fail:value=>fail=value,event:(event,value)=>{current=value;callback(event,value);}};
}
function render(Component,props={},value={}){
 return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AuthContext.Provider,{value:{loading:false,session:null,profile:null,avatarUrl:null,profileLoading:false,error:'',recovery:false,configured:true,actions:null,...value}},React.createElement(Component,props))));
}

test('auth loading gate never renders protected planner data',()=>{
 const html=render(AuthGate,{children:React.createElement('p',null,'PRIVATE TASK')},{loading:true});
 assert.match(html,/Restoring your session/);assert.doesNotMatch(html,/PRIVATE TASK/);
 assert.doesNotMatch(render(AuthGate,{children:'PRIVATE TASK'}),/PRIVATE TASK/);
 assert.match(render(AuthGate,{children:'PRIVATE TASK'},{session:session('A')}),/PRIVATE TASK/);
});
test('sign in, sign up and recovery forms use the approved shared controls',()=>{
 assert.match(render(AuthPage,{mode:'sign-in'}),/Welcome back/);assert.match(render(AuthPage,{mode:'sign-up'}),/Create your account/);
 assert.match(render(AuthPage,{mode:'forgot-password'}),/Send recovery email/);
 assert.match(render(AuthPage,{mode:'reset-password'}),/Open the recovery link/);
 assert.match(render(AuthPage,{mode:'reset-password'},{session:session('A'),recovery:true}),/Confirm password/);
 assert.match(render(AuthPage,{mode:'check-email'}),/Check your email/);
 assert.doesNotMatch(render(AuthPage,{mode:'sign-in'},{configured:false}),/type="password"/);
});
test('session restoration is persistent and known before workspace loads',async t=>{
 const {store}=setup(t,session('A'));assert.equal(store.getSnapshot().loading,true);await store.initialize();
 assert.equal(store.getSnapshot().session.user.id,'A');assert.equal(store.getSnapshot().loading,false);
});
test('sign in establishes session and invalid credentials leave it signed out',async t=>{
 const {store}=setup(t);await store.initialize();
 await assert.rejects(store.signIn('A','wrong'),/Invalid login/);assert.equal(store.getSnapshot().session,null);
 assert.equal(authMessage(new Error('Invalid login credentials')),'Email or password is incorrect.');
 await store.signIn('A','correct');assert.equal(store.getSnapshot().session.user.id,'A');
});
test('sign up requests email confirmation and never invents a confirmed session',async t=>{
 const {store,calls}=setup(t);await store.initialize();assert.equal(await store.signUp('A','strong-password'),false);
 assert.equal(store.getSnapshot().session,null);assert.equal(calls.find(c=>c.signup).signup.options.emailRedirectTo,'http://localhost:5173/auth/callback');
});
test('forgot password, recovery event and password update follow provider flow',async t=>{
 const {store,calls,event}=setup(t);await store.initialize();await store.resetPassword('A');
 assert.equal(calls.find(c=>c.recover).options.redirectTo,'http://localhost:5173/reset-password');
 event('PASSWORD_RECOVERY',session('A'));assert.equal(store.getSnapshot().recovery,true);
 assert.doesNotMatch(render(AuthGate,{children:'PRIVATE TASK'},store.getSnapshot()),/PRIVATE TASK/);
 await store.updatePassword('new-password');assert.equal(store.getSnapshot().recovery,false);
});
test('Google OAuth uses Supabase and the fixed app callback',async t=>{
 const {store,calls}=setup(t);await store.google();
 assert.deepEqual(calls.find(c=>c.oauth).oauth,{provider:'google',options:{redirectTo:'http://localhost:5173/auth/callback'}});
});
test('profile loading and updates use authenticated backend API',async t=>{
 const {store,calls}=setup(t,session('A'));await store.initialize();await store.refreshProfile();
 assert.equal(store.getSnapshot().profile.user_id,'A');await store.updateProfile({display_name:'Alex'});
 const patch=calls.find(c=>c.method==='PATCH');assert.equal(patch.headers.Authorization,'Bearer token-A');assert.deepEqual(JSON.parse(patch.body),{display_name:'Alex'});
});
test('sign out immediately removes profile/avatar/session and protected workspace',async t=>{
 const {store}=setup(t,session('A'));await store.initialize();await store.refreshProfile();await store.signOut();
 assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().profile,null);assert.equal(store.getSnapshot().avatarUrl,null);
 assert.doesNotMatch(render(AuthGate,{children:'A PRIVATE TASK'},store.getSnapshot()),/A PRIVATE TASK/);
});
test('account switch clears A profile synchronously and ignores old in-flight profile response',async t=>{
 const {store,event,fail}=setup(t,session('A'));await store.initialize();
 let release;fail(()=>new Promise(resolve=>release=resolve));const old=store.refreshProfile();
 await new Promise(resolve=>setImmediate(resolve));event('SIGNED_IN',session('B'));
 assert.equal(store.getSnapshot().profile,null);assert.equal(await store.token('A'),null);
 release(json(profile('A')));await old;assert.equal(store.getSnapshot().session.user.id,'B');assert.equal(store.getSnapshot().profile,null);
 fail(null);await store.refreshProfile();assert.equal(store.getSnapshot().profile.user_id,'B');
 await store.expire('A');assert.equal(store.getSnapshot().session.user.id,'B');
 // The planner store is instantiated per keyed account boundary, never reused.
 const newWorkspace=createAppDataStore(createApi('http://mock.invalid'));assert.deepEqual(newWorkspace.getSnapshot().state.tasks,[]);assert.deepEqual(newWorkspace.getSnapshot().state.risks,[]);assert.equal(newWorkspace.getSnapshot().replanPreview,null);
});
test('unauthorized API response clears session once without retry loops',async t=>{
 const {store,calls,fail}=setup(t,session('A'));await store.initialize();fail(()=>json({},401));
 await store.refreshProfile();assert.equal(store.getSnapshot().session,null);
 assert.equal(calls.filter(c=>c.url?.includes('/api/profile')).length,1);
});
test('API never sends a request with a missing token',async t=>{
 const before=global.fetch;let requests=0,expired=0;global.fetch=async()=>{requests++;return json({});};t.after(()=>global.fetch=before);
 const api=createApiClient('http://mock.invalid',{getAccessToken:async()=>null,onUnauthorized:()=>expired++});
 await assert.rejects(api.request('/api/tasks'),/sign in again/);assert.equal(requests,0);assert.equal(expired,1);
});
test('profile shows identity and avatar controls; destructive confirmation lives in account settings',()=>{
 const html=render(ProfilePanel,{}, {session:session('A'),profile:profile('A')});
 assert.match(html,/A@example.test/);assert.match(html,/Europe\/Budapest/);assert.match(html,/Change avatar/);
 assert.doesNotMatch(html,/Delete account|Sign out|Appearance/);
 const security=render(AccountSecurity,{}, {session:session('A'),profile:profile('A')});
 assert.match(security,/Type DELETE to confirm/);assert.match(security,/disabled=""[^>]*>Permanently delete account/);
});
test('account deletion keeps session on server failure and clears it only after success',async t=>{
 const {store,calls,fail}=setup(t,session('A'));await store.initialize();fail(()=>json({detail:'Unavailable'},503));
 await assert.rejects(store.deleteAccount('DELETE'));assert.equal(store.getSnapshot().session.user.id,'A');
 fail(null);await store.deleteAccount('DELETE');assert.equal(store.getSnapshot().session,null);
 assert.deepEqual(JSON.parse(calls.find(c=>c.method==='DELETE').body),{confirmation:'DELETE'});
});
test('avatar validation rejects SVG, mismatched headers and oversized files',async()=>{
 await assert.rejects(validateAvatar(new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'})),/valid PNG/);
 await assert.rejects(validateAvatar(new File([new Uint8Array(2097153)],'huge.png',{type:'image/png'})),/2 MB/);
 assert.equal(await validateAvatar(new File([new Uint8Array([137,80,78,71,13,10,26,10])],'a.png',{type:'image/png'})),'png');
});
test('avatar replacement saves a unique private path before removing old object',async()=>{
 const actions=[];const client={storage:{from:bucket=>({upload:async(path)=>{actions.push(['upload',bucket,path]);return {error:null};},remove:async paths=>{actions.push(['remove',paths]);return {error:null};}})}};
 const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'a.png',{type:'image/png'});
 await replaceAvatar(client,'A',file,'A/old.png',async path=>{actions.push(['save',path]);});
 assert.match(actions[0][2],/^A\/.*\.png$/);assert.equal(actions[1][0],'save');assert.deepEqual(actions[2],['remove',['A/old.png']]);
});
test('failed avatar profile save removes new upload and preserves old avatar',async()=>{
 const removed=[];const client={storage:{from:()=>({upload:async()=>({error:null}),remove:async paths=>{removed.push(...paths);return {error:null};}})}};
 const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'a.png',{type:'image/png'});
 await assert.rejects(replaceAvatar(client,'A',file,'A/old.png',async()=>{throw new Error('server failure');}));
 assert.equal(removed.length,1);assert.notEqual(removed[0],'A/old.png');
 const actions=[];await removeAvatar(client,'A/old.png',async path=>{actions.push(path);});assert.deepEqual(actions,[null]);
});


test('public configuration rejects service-role JWTs and secret keys',()=>{
 const {isPublishableKey}=require('../src/auth/publicConfig.ts');
 const token=role=>'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
 assert.equal(isPublishableKey('sb_publishable_fixture'),true);
 assert.equal(isPublishableKey(token('anon')),true);
 assert.equal(isPublishableKey(token('service_role')),false);
 assert.equal(isPublishableKey('sb_secret_fixture'),false);
});

test('reset form is gated by a recovery flow, not merely a preexisting signed-in account',()=>{
 assert.doesNotMatch(render(AuthPage,{mode:'reset-password'},{session:session('A'),recovery:false}),/Confirm password/);
});


test('unmounted account store clears all entities and rejects late responses',async()=>{
 let release;const blocked=new Promise(resolve=>release=resolve);
 const empty={list:async()=>[]};
 const api={subjects:empty,tasks:{list:()=>blocked},availability:empty,sessions:empty,risks:{read:async()=>({tasks:[],subjects:[]})}};
 const store=createAppDataStore(api);const loading=store.load();store.dispose();
 release([{id:'private-A-task'}]);await loading;
 assert.deepEqual(store.getSnapshot().state.tasks,[]);assert.deepEqual(store.getSnapshot().state.subjects,[]);
 assert.deepEqual(store.getSnapshot().state.risks,[]);assert.equal(store.getSnapshot().replanPreview,null);
 assert.match(await store.dispatch({type:'complete-task',id:'private-A-task'}),/session has ended/);
});


test('a stale SDK token read cannot authorize a disposed account after switching',async t=>{
 const {store,client,event}=setup(t,session('A'));await store.initialize();
 let release;client.auth.getSession=()=>new Promise(resolve=>release=resolve);
 const read=store.token('A');event('SIGNED_IN',session('B'));
 release({data:{session:session('A')},error:null});assert.equal(await read,null);
});


test('refresh network failure does not discard an otherwise active cached identity',async t=>{
 const {store,client}=setup(t,session('A'));await store.initialize();
 client.auth.getSession=async()=>({data:{session:null},error:new Error('offline')});
 await assert.rejects(store.token('A'),/Cannot refresh your session/);
 assert.equal(store.getSnapshot().session.user.id,'A');
});

test('local signout clears immediately and its late completion cannot clear a new account',async t=>{
 const {store,client,event}=setup(t,session('A'));await store.initialize();
 let release;client.auth.signOut=()=>new Promise(resolve=>release=resolve);
 const leaving=store.signOut();assert.equal(store.getSnapshot().session,null);
 event('SIGNED_IN',session('B'));release({error:null});await leaving;
 assert.equal(store.getSnapshot().session.user.id,'B');
});
