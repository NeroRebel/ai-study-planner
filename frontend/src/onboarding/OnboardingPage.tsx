import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {ArrowLeft,ArrowRight,BookOpen,Sparkles} from 'lucide-react';
import {useAuth} from '../auth/AuthContext';
import {authMessage} from '../auth/authStore';
import type {Interest,StudyLevel,StudyPeriod} from '../auth/profile';
import {studyGoals} from '../auth/profile';
import {BrandMark} from '../components/common/BrandMark';
import {SelectableChip} from '../components/common/SelectableChip';
import {Button,CheckControl,SegmentedControl} from '../components/common/Controls';
import {FormField} from '../components/common/FormField';
import {Feedback} from '../components/common/Feedback';
import {addCustomInterest,days,interestOptions,setupDraft,stepPayload,steps,validateSetup} from './model';

export function OnboardingPage() {
  const auth=useAuth();
  const [draft,setDraft]=useState(()=>setupDraft(auth.profile!));
  const [step,setStep]=useState(()=>Math.min(5,Math.max(1,auth.profile?.onboarding_step||1)));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [custom,setCustom]=useState(''),[customType,setCustomType]=useState<Interest['type']>('subject');
  const [startMode,setStartMode]=useState<'manual'|'ai'>('manual'),[createSubjects,setCreateSubjects]=useState(false);
  const mounted=useRef(true),heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{document.title=steps[step-1]+' · Set up AI Study Planner';},[step]);
  const update=<K extends keyof typeof draft>(key:K,value:typeof draft[K])=>setDraft(current=>({...current,[key]:value}));
  async function next(event:FormEvent) {
    event.preventDefault();if(busy||!auth.actions)return;
    const issue=validateSetup(draft,step);if(issue){setError(issue);return;}
    setBusy(true);setError('');
    try {
      if(step<5){await auth.actions.updateProfile(stepPayload(draft,step));if(mounted.current)setStep(step+1);}
      else await auth.actions.completeOnboarding({start_mode:startMode,create_subjects:createSubjects,skip:false,subject_names:createSubjects?draft.interests.filter(item=>item.type==='subject').map(item=>item.name):[]});
    } catch(error){if(mounted.current)setError(authMessage(error));}
    finally{if(mounted.current)setBusy(false);}
  }
  async function skip(){
    if(busy||!auth.actions)return;setBusy(true);setError('');
    try{await auth.actions.completeOnboarding({start_mode:'manual',create_subjects:false,skip:true});}
    catch(error){if(mounted.current)setError(authMessage(error));}
    finally{if(mounted.current)setBusy(false);}
  }
  function toggleInterest(interest:Interest){
    const selected=draft.interests.some(item=>item.name.toLowerCase()===interest.name.toLowerCase());
    if(!selected&&draft.interests.length>=30){setError('Select up to 30 interests.');return;}
    update('interests',selected?draft.interests.filter(item=>item.name.toLowerCase()!==interest.name.toLowerCase()):[...draft.interests,interest]);setError('');
  }
  const choices=[...interestOptions,...draft.interests.filter(item=>!interestOptions.some(option=>option.name.toLowerCase()===item.name.toLowerCase()))];
  const subjects=draft.interests.filter(item=>item.type==='subject');
  return <main className="onboarding-shell">
    <header className="onboarding-topbar"><span className="brand"><BrandMark/>AI Study Planner</span><button className="text-button" disabled={busy} onClick={()=>{void auth.actions?.signOut();}}>Sign out</button></header>
    <div className="onboarding-layout">
      <aside className="onboarding-progress" aria-label="Setup progress"><p className="eyebrow">YOUR STUDY WORKSPACE</p><h1>Make room<br/>for what matters.</h1><p>A few details today.<br/>A more personal planner tomorrow.</p>
        <ol>{steps.map((label,index)=><li key={label} aria-current={step===index+1?'step':undefined} className={step===index+1?'is-current':index+1<step?'is-done':''}><span>{String(index+1).padStart(2,'0')}</span>{label}</li>)}</ol>
        <small>Private to your account. Optional details can be left blank.</small>
      </aside>
      <section className="onboarding-panel" aria-label="Set up your workspace">
        <div className="onboarding-step-caption"><span>Step {step} of 5</span><span>Saved between steps</span></div>
        <div className="onboarding-progress-bar" role="progressbar" aria-label="Setup step" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step}><span style={{width:step*20+'%'}}/></div>
        <form onSubmit={next} aria-busy={busy}>
          <AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.16}} onAnimationComplete={()=>{if(mounted.current)heading.current?.focus({preventScroll:true});}}>
            <h2 ref={heading} tabIndex={-1} className="onboarding-title">{['Tell us a little about you','What are you studying?','Find your study rhythm','What would you like to achieve?','How would you like to start?'][step-1]}</h2>
            <p className="onboarding-description">{['Your academic details are optional. You can change them in Profile later.','Choose subjects and skills, or add your own. Nothing becomes a course without your approval.','These are preferences, not calendar reservations. Your saved availability still controls planning.','Pick what matters to you. These goals help your Assistant give relevant recommendations.','Choose your next step, and decide whether to add your selected subjects.'][step-1]}</p>
            <fieldset disabled={busy} className="onboarding-fields">
              {step===1&&<><FormField label="University (optional)"><input maxLength={160} autoComplete="organization" value={draft.university} onChange={e=>update('university',e.target.value)}/></FormField>
                <FormField label="Study program / major (optional)"><input maxLength={160} value={draft.study_program} onChange={e=>update('study_program',e.target.value)}/></FormField>
                <div className="form-grid"><FormField label="Study level"><select value={draft.study_level} onChange={e=>update('study_level',e.target.value as StudyLevel|'')}><option value="">Prefer not to say</option>{['Bachelor','Master','PhD','Other'].map(value=><option key={value}>{value}</option>)}</select></FormField>
                  <FormField label="Study year (optional)"><input type="number" min={1} max={12} value={draft.study_year} onChange={e=>update('study_year',e.target.value)}/></FormField></div></>}
              {step===2&&<>{(['subject','skill'] as const).map(type=><div className="onboarding-chip-group" key={type}><h3>{type==='subject'?'Subjects':'Skills'}</h3><div className="chip-grid">{choices.filter(item=>item.type===type).map(item=><SelectableChip key={item.name} label={item.name} selected={draft.interests.some(value=>value.name.toLowerCase()===item.name.toLowerCase())} onChange={()=>toggleInterest(item)} disabled={busy}/>)}</div></div>)}
                <div className="custom-interest"><FormField label="Add a custom interest"><input maxLength={80} value={custom} onChange={e=>setCustom(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();try{update('interests',addCustomInterest(draft.interests,custom,customType));setCustom('');setError('');}catch(error){setError(authMessage(error));}}}}/></FormField>
                  <FormField label="Interest type"><select value={customType} onChange={e=>setCustomType(e.target.value as Interest['type'])}><option value="subject">Subject</option><option value="skill">Skill</option></select></FormField>
                  <Button onClick={()=>{try{update('interests',addCustomInterest(draft.interests,custom,customType));setCustom('');setError('');}catch(error){setError(authMessage(error));}}}>Add custom</Button></div></>}
              {step===3&&<><div><label className="range-label" htmlFor="weekly-target">Weekly study target <strong>{draft.weekly_study_hours}h</strong></label><input id="weekly-target" type="range" min={1} max={80} value={draft.weekly_study_hours} onChange={e=>update('weekly_study_hours',Number(e.target.value))}/><div className="hour-presets">{[5,10,15,20].map(hours=><button type="button" key={hours} aria-pressed={draft.weekly_study_hours===hours} onClick={()=>update('weekly_study_hours',hours)}>{hours}h</button>)}</div></div>
                <SegmentedControl label="Preferred session duration" value={String(draft.preferred_session_minutes)} options={[30,45,60,90].map(value=>({value:String(value),label:value+' min'}))} onChange={value=>update('preferred_session_minutes',Number(value) as 30|45|60|90)}/>
                <SegmentedControl label="Preferred study period" value={draft.preferred_study_period} options={(['Morning','Afternoon','Evening','Flexible'] as const).map(value=>({value,label:value}))} onChange={value=>update('preferred_study_period',value as StudyPeriod)}/>
                <div><h3>Preferred study days</h3><p className="form-note">Optional. Choose weekends only if you want to study then.</p><div className="chip-grid study-day-chips">{days.map((day,index)=><SelectableChip key={day} label={day} selected={draft.preferred_study_days.includes(index+1)} onChange={()=>update('preferred_study_days',draft.preferred_study_days.includes(index+1)?draft.preferred_study_days.filter(value=>value!==index+1):[...draft.preferred_study_days,index+1])}/>)}</div></div></>}
              {step===4&&<div className="chip-grid goal-chips">{studyGoals.map(goal=><SelectableChip key={goal} label={goal} selected={draft.goals.includes(goal)} onChange={()=>update('goals',draft.goals.includes(goal)?draft.goals.filter(value=>value!==goal):[...draft.goals,goal])}/>)}</div>}
              {step===5&&<><fieldset className="start-mode-options"><legend className="sr-only">Start mode</legend>{([{value:'ai',title:'Let AI help set up my workspace',description:"We'll use your subjects, preferences and goals to help create your first study setup.",icon:Sparkles},{value:'manual',title:"I'll set it up myself",description:'Add tasks, deadlines and availability manually. Your selected subjects are optional.',icon:BookOpen}] as const).map(({value,title,description,icon:Icon})=><label className={'start-mode-card '+(startMode===value?'is-selected':'')} key={value}><input type="radio" name="start-mode" value={value} checked={startMode===value} onChange={()=>setStartMode(value)}/><Icon size={20} aria-hidden="true"/><span><strong>{title}</strong><small>{description}</small></span></label>)}</fieldset>
                {subjects.length>0?<label className="subject-approval"><CheckControl checked={createSubjects} onChange={e=>setCreateSubjects(e.target.checked)}/><span><strong>Add these subjects to my workspace</strong><small>{subjects.map(item=>item.name).join(', ')}</small></span></label>:<p className="form-note">No subjects selected. You can add subjects in your workspace later.</p>}
                <p className="form-note">Skills remain interests. Tasks, deadlines and dated availability are never invented. AI actions and plan generation require separate approval.</p></>}
            </fieldset>
          </motion.div></AnimatePresence>
          {error&&<Feedback tone="error">{error}</Feedback>}
          <footer className="onboarding-actions"><Button disabled={busy||step===1} variant="ghost" onClick={()=>{setError('');setStep(step-1);}}><ArrowLeft size={15}/>Back</Button>
            <Button type="submit" variant="primary" loading={busy}>{step===5?startMode==='ai'?'Continue with Assistant':'Open my workspace':'Continue'}<ArrowRight size={15}/></Button></footer>
        </form>
        <button type="button" className="text-button onboarding-skip" disabled={busy} onClick={()=>{void skip();}}>Skip for now</button>
        <p className="onboarding-privacy">Skipping finishes setup without creating anything. You can edit your details and preferences later.</p>
      </section>
    </div>
  </main>;
}

