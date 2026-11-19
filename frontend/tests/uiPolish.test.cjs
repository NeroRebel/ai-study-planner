require('./register.cjs');
const test=require('node:test'), assert=require('node:assert/strict'), React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {AppDataContext}=require('../src/state/AppDataContext.ts');
const {createInitialState}=require('../src/state/appState.ts');
const {selectSummary,selectDays}=require('../src/state/selectors.ts');
const {MotionProvider}=require('../src/components/common/MotionProvider.tsx');
const {Modal}=require('../src/components/common/Modal.tsx');
const {Feedback}=require('../src/components/common/Feedback.tsx');
const {LoadingState}=require('../src/components/common/LoadingState.tsx');
const {AssistantPanel}=require('../src/components/assistant/AssistantPanel.tsx');
const {ProgressPage}=require('../src/pages/ProgressPage.tsx');
const {FormField}=require('../src/components/common/FormField.tsx');
function render(Component,props={},extra={}) {
 const state=createInitialState();
 return renderToStaticMarkup(React.createElement(MemoryRouter,null,
  React.createElement(AppDataContext.Provider,{value:{state,summary:selectSummary(state),studyDays:selectDays(state),
   assistant:{messages:[],busy:false,error:'',canRetry:false},assistantStore:{},...extra}},
   React.createElement(MotionProvider,null,React.createElement(Component,props)))));
}
test('animated modal retains named native dialog and accessible close control',()=>{
 const html=render(Modal,{title:'Edit task',onClose:()=>{},children:React.createElement('input',{'aria-label':'Title'})});
 assert.match(html,/<dialog[^>]+aria-labelledby=/);assert.match(html,/id="[^"]+">Edit task/);
 assert.match(html,/aria-label="Close dialog"/);assert.match(html,/aria-label="Title"/);
});
test('busy transactional modal disables close without hiding its content',()=>{
 const html=render(Modal,{title:'Applying changes',onClose:()=>{},closeDisabled:true,children:'Saving exact preview'});
 assert.match(html,/disabled=""[^>]*aria-label="Close dialog"|aria-label="Close dialog"[^>]*disabled=""/);
 assert.match(html,/Saving exact preview/);
});
test('motion policy does not remove controls or content for reduced-motion users',()=>{
 const {MotionConfigContext}=require('motion/react');
 function Policy(){const context=React.useContext(MotionConfigContext);return React.createElement('button',null,context.reducedMotion);}
 assert.match(render(Policy),/>user<\/button>/);
});
test('loading state announces one description and hides decorative skeletons',()=>{
 const html=render(LoadingState,{title:'Loading schedule',description:'Fetching saved sessions.'});
 assert.match(html,/role="status"/);assert.match(html,/aria-hidden="true"/);assert.match(html,/Fetching saved sessions/);
});
test('feedback distinguishes errors and saved success with text and live-region semantics',()=>{
 assert.match(render(Feedback,{tone:'error',children:'Could not save.',action:React.createElement('button',null,'Retry')}),/role="alert"/);
 assert.match(render(Feedback,{tone:'success',children:'Saved.'}),/role="status"/);
 assert.match(render(Feedback,{tone:'warning',children:'2h unscheduled'}),/2h unscheduled/);
});
test('Assistant has a labelled multiline composer and readable pending feedback',()=>{
 const html=render(AssistantPanel,{full:true});
 assert.match(html,/<textarea[^>]+id="full-assistant-input"/);
 assert.match(html,/Message study assistant/);assert.match(html,/Shift \+ Enter/);
 assert.match(html,/aria-label="Send message"/);
});
test('Progress shows saved task effort without fabricated completion history',()=>{
 const state=createInitialState();state.tasks=[{id:'t',title:'Saved assignment',deadline:'2099-01-01',status:'IN_PROGRESS',estimated_hours:4,remaining_hours:3,progress:25}];
 const html=render(ProgressPage,{}, {state,summary:selectSummary(state),studyDays:selectDays(state)});
 assert.match(html,/Saved assignment/);assert.match(html,/25%/);assert.match(html,/3h remaining/);
 assert.doesNotMatch(html,/historical fixtures|Task completion trend/);
});
test('empty Progress offers an honest start state rather than a synthetic trend',()=>{
 const html=render(ProgressPage);assert.match(html,/Your progress starts here/);
 assert.doesNotMatch(html,/historical fixtures|Current<\/text>/);
});
test('field labels exclude select options and associate help text separately',()=>{
 const html=render(FormField,{label:'Task',hint:'Choose saved work',children:React.createElement('select',null,React.createElement('option',null,'Database exam'))});
 const id=html.match(/<label for="([^"]+)"/)[1];
 assert.ok(html.includes(`<select id="${id}"`));
 assert.match(html,/<label[^>]+>Task<\/label>/);assert.match(html,/aria-describedby=/);
 assert.match(html,/Choose saved work/);
});
