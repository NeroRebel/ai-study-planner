require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {AuthContext}=require('../src/auth/AuthContext.ts');
const {AppDataContext}=require('../src/state/AppDataContext.ts');
const {createInitialState}=require('../src/state/appState.ts');
const {selectSummary,selectDays}=require('../src/state/selectors.ts');
const {MotionProvider}=require('../src/components/common/MotionProvider.tsx');
const {Sidebar}=require('../src/components/layout/Sidebar.tsx');
const {AppLayout}=require('../src/components/layout/AppLayout.tsx');
const {DashboardAssistant}=require('../src/components/assistant/DashboardAssistant.tsx');
const {AssistantPanel}=require('../src/components/assistant/AssistantPanel.tsx');
const {WeeklyPlanner}=require('../src/components/calendar/WeeklyPlanner.tsx');
const {StudyLoad}=require('../src/components/dashboard/StudyLoad.tsx');
const {uiPreferences,defaultUiPreferences}=require('../src/state/uiPreferences.ts');
function render(Component,props={},route='/settings') {
 const state=createInitialState();state.preferences.name='Alex Morgan';
 return renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[route]},
  React.createElement(AuthContext.Provider,{value:{session:{user:{id:'A'}},profile:{display_name:'Alex Morgan'},avatarUrl:null}},
   React.createElement(AppDataContext.Provider,{value:{state,status:'ready',summary:selectSummary(state),studyDays:selectDays(state),assistant:{messages:[],busy:false,error:'',canRetry:false},assistantStore:{}}},
    React.createElement(MotionProvider,null,React.createElement(Component,props))))));
}
test('expanded identity contains one integrated Collapse control and product home link',()=>{
 const html=render(Sidebar);assert.match(html,/sidebar-identity/);assert.match(html,/AI Study Planner home/);
 assert.equal((html.match(/aria-label="Collapse sidebar"/g)||[]).length,1);assert.doesNotMatch(html,/aria-label="Expand sidebar"/);
 assert.match(html,/aria-controls="sidebar-navigation"/);
});
test('collapsed identity is a single reopen control with no duplicated home/title controls',t=>{
 uiPreferences.update({sidebarCollapsed:true});t.after(()=>uiPreferences.update(defaultUiPreferences));
 const html=render(Sidebar);assert.equal((html.match(/aria-label="Expand sidebar"/g)||[]).length,1);
 assert.doesNotMatch(html,/AI Study Planner home|aria-label="Collapse sidebar"|class="nav-copy"/);
 assert.match(html,/rail-open-icon/);assert.match(html,/data-tooltip="Tasks"/);assert.match(html,/aria-label="Settings"/);
});
test('Settings is isolated in a utility group and retains its active router state',()=>{
 const html=render(Sidebar);assert.match(html,/class="sidebar-utilities" aria-label="Workspace settings"/);
 assert.match(html,/<a[^>]+aria-label="Settings"[^>]+class="nav-item active"/);
 assert.equal((html.match(/aria-label="Settings"/g)||[]).length,1);
});
test('shell has one profile entry and a topbar without a second avatar control',()=>{
 const html=render(AppLayout);assert.equal((html.match(/aria-label="Open your profile"/g)||[]).length,1);
 const topbar=html.match(/<header class="topbar">(.*?)<\/header>/s)[1];
 assert.doesNotMatch(topbar,/topbar-profile|mini-avatar|href="\/profile"/);assert.match(topbar,/Personal workspace/);
 assert.match(topbar,/aria-label="Breadcrumb"/);
});
test('docked Assistant offers one local close action while retaining the normal composer',()=>{
 const html=render(DashboardAssistant,{docked:true,hidden:false,overlayOpen:false,onClose:()=>{}});
 assert.equal((html.match(/aria-label="Hide assistant panel"/g)||[]).length,1);assert.match(html,/Message study assistant/);
});
test('hidden dock is removed from keyboard and accessibility navigation',()=>{
 const html=render(DashboardAssistant,{docked:true,hidden:true,overlayOpen:false,onClose:()=>{}});
 assert.match(html,/inert=""/);assert.match(html,/aria-hidden="true"/);assert.doesNotMatch(html,/Message study assistant/);
});
test('compact layout only opens the Assistant on request in a named native dialog',()=>{
 assert.equal(render(DashboardAssistant,{docked:false,hidden:false,overlayOpen:false,onClose:()=>{}}),'');
 const html=render(DashboardAssistant,{docked:false,hidden:false,overlayOpen:true,onClose:()=>{}});
 assert.match(html,/<dialog/);assert.match(html,/Study assistant/);assert.match(html,/aria-label="Close dialog"/);
 assert.doesNotMatch(html,/aria-label="Hide assistant panel"/);
});
test('full Assistant route does not acquire the dock-only close control',()=>{
 const html=render(AssistantPanel,{full:true});assert.doesNotMatch(html,/Hide assistant panel/);assert.match(html,/full-assistant-input/);
});
test('empty Dashboard week offers a useful next step without repeated empty day cells',()=>{
 const html=render(WeeklyPlanner);assert.match(html,/A little structure for your week/);assert.match(html,/Open Calendar/);
 assert.doesNotMatch(html,/No sessions|aria-label="Previous week"/);
});
test('empty study load explains missing planned data instead of showing a synthetic chart',()=>{
 const html=render(StudyLoad);assert.match(html,/No study time planned/);assert.match(html,/Plan study time/);
 assert.doesNotMatch(html,/role="img"|load-planned/);
});
