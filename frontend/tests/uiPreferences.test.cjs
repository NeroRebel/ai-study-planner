require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {createUiPreferencesStore,defaultUiPreferences,sanitizePreferences,resolveTheme,resolveReducedMotion,applyUiPreferences,calendarDimensions,UI_PREFERENCES_KEY}=require('../src/state/uiPreferences.ts');
const {CheckControl,Toggle,SegmentedControl,Button}=require('../src/components/common/Controls.tsx');
const {Breadcrumbs}=require('../src/components/layout/Breadcrumbs.tsx');
const {SettingsPage}=require('../src/pages/SettingsPage.tsx');
const {AuthContext}=require('../src/auth/AuthContext.ts');
const render=(Component,props={})=>renderToStaticMarkup(React.createElement(MemoryRouter,null,
 React.createElement(AuthContext.Provider,{value:{actions:null,session:null,profile:null}},React.createElement(Component,props))));

test('appearance and layout preferences survive a new store with validated values',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const store=createUiPreferencesStore(storage);let notices=0;store.subscribe(()=>notices++);
 store.update({theme:'dark',contrast:'high',accent:'teal',sidebarCollapsed:true,calendarDensity:'wide',motion:'reduced'});
 const reloaded=createUiPreferencesStore(storage);assert.equal(notices,1);
 assert.deepEqual(reloaded.getSnapshot(),store.getSnapshot());assert.ok(values.has(UI_PREFERENCES_KEY));
 assert.equal(reloaded.getSnapshot().theme,'dark');assert.equal(reloaded.getSnapshot().accent,'teal');
});
test('invalid stored preferences and unknown fields cannot alter configuration or inject account data',()=>{
 assert.deepEqual(sanitizePreferences({theme:'javascript:',user_id:'other',accent:'danger',sessionMinutes:-1}),defaultUiPreferences);
 assert.deepEqual(createUiPreferencesStore({getItem:()=>'{broken',setItem:()=>{}}).getSnapshot(),defaultUiPreferences);
 assert.equal(sanitizePreferences({sessionMinutes:240}).sessionMinutes,240);
});
test('denied storage keeps controls functional and reports that persistence failed',()=>{
 const store=createUiPreferencesStore({getItem:()=>null,setItem:()=>{throw Error('denied');}});
 store.update({theme:'dark'});assert.equal(store.getSnapshot().theme,'dark');assert.equal(store.hasPersistenceError(),true);
});
test('system theme follows OS while explicit light and dark override it',()=>{
 assert.equal(resolveTheme('system',true),'dark');assert.equal(resolveTheme('system',false),'light');
 assert.equal(resolveTheme('light',true),'light');assert.equal(resolveTheme('dark',false),'dark');
});
test('motion System, Reduced and Full have explicit and independent behavior',()=>{
 assert.equal(resolveReducedMotion('system',true),true);assert.equal(resolveReducedMotion('system',false),false);
 assert.equal(resolveReducedMotion('reduced',false),true);assert.equal(resolveReducedMotion('full',true),false);
});
test('theme, contrast, accent, motion and sidebar update root attributes without changing domain state',t=>{
 const before=global.document,root={dataset:{},style:{}};global.document={documentElement:root};t.after(()=>global.document=before);
 applyUiPreferences({...defaultUiPreferences,theme:'dark',accent:'red',contrast:'high',sidebarCollapsed:true,motion:'reduced'},false,false);
 assert.deepEqual(root.dataset,{theme:'dark',contrast:'high',accent:'red',motion:'reduced',density:'comfortable',sidebar:'collapsed'});
 assert.equal(root.style.colorScheme,'dark');
});
test('cross-tab preferences update the current snapshot; malformed updates preserve it',()=>{
 const store=createUiPreferencesStore();store.receive(JSON.stringify({theme:'dark',accent:'blue'}));
 assert.equal(store.getSnapshot().accent,'blue');store.receive('{bad');assert.equal(store.getSnapshot().theme,'dark');
 store.receive(null);assert.equal(store.getSnapshot().theme,'system');
});
test('custom checkbox retains native label, checked, disabled and change semantics',()=>{
 let changed;const element=CheckControl({'aria-label':'Complete task',checked:true,onChange:event=>changed=event.target.checked});
 element.props.onChange({target:{checked:false}});assert.equal(changed,false);
 const html=render(CheckControl,{'aria-label':'Complete task',checked:true,disabled:true});
 assert.match(html,/type="checkbox"/);assert.match(html,/checked=""/);assert.match(html,/disabled=""/);assert.match(html,/Complete task/);
});
test('toggle and segmented controls expose native keyboard semantics and accessible labels',()=>{
 const toggle=render(Toggle,{label:'Expand explanations',description:'Open risk details',checked:true,onChange:()=>{}});
 assert.match(toggle,/role="switch"/);assert.match(toggle,/label for=/);assert.match(toggle,/aria-describedby=/);
 const segment=render(SegmentedControl,{label:'Theme',value:'dark',options:[{value:'light',label:'Light'},{value:'dark',label:'Dark'}],onChange:()=>{}});
 assert.match(segment,/<legend>Theme/);assert.equal((segment.match(/type="radio"/g)||[]).length,2);assert.match(segment,/checked=""/);
});
test('busy buttons are disabled, named and announce loading without duplicate interaction',()=>{
 const html=render(Button,{loading:true,children:'Save profile'});
 assert.match(html,/aria-busy="true"/);assert.match(html,/disabled=""/);assert.match(html,/Save profile/);
});
test('breadcrumbs use router links for parents and mark only current segment as current',()=>{
 const html=render(Breadcrumbs,{title:'Tasks',pathname:'/tasks',detail:'Edit task'});
 assert.match(html,/href="\/"/);assert.match(html,/href="\/tasks"/);assert.match(html,/aria-current="page">Edit task/);
 assert.equal((html.match(/aria-current=/g)||[]).length,1);
});
test('Settings exposes real presentation preferences and keeps identity editing on Profile',()=>{
 const html=render(SettingsPage);assert.match(html,/href="\/profile"/);assert.match(html,/Accent color/);assert.match(html,/High contrast/);
 assert.match(html,/New manual block duration/);assert.match(html,/Confirmation is always required/);
 assert.match(html,/Account &amp; Security/);assert.doesNotMatch(html,/Display name|Choose avatar|Preferred study start time/);
});
test('calendar density enforces increasing minimum widths and readable aligned hour heights',()=>{
 assert.ok(calendarDimensions.compact.column>=120);assert.ok(calendarDimensions.comfortable.column>calendarDimensions.compact.column);
 assert.ok(calendarDimensions.wide.column>calendarDimensions.comfortable.column);assert.ok(calendarDimensions.compact.hour>=50);
});
