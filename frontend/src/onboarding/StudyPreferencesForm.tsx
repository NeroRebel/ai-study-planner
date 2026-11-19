import {useState} from 'react';
import type {FormEvent} from 'react';
import {useAuth} from '../auth/AuthContext';
import type {StudyPeriod} from '../auth/profile';
import {studyGoals} from '../auth/profile';
import {authMessage} from '../auth/authStore';
import {Button} from '../components/common/Controls';
import {SelectableChip} from '../components/common/SelectableChip';
import {FormField} from '../components/common/FormField';
import {Feedback} from '../components/common/Feedback';
import {days} from './model';
import {uiPreferences,useUiPreferences} from '../state/uiPreferences';

export function StudyPreferencesForm() {
  const auth=useAuth(),local=useUiPreferences();
  const [hours,setHours]=useState(auth.profile?.weekly_study_hours??10);
  const [duration,setDuration]=useState(auth.profile?.preferred_session_minutes??([30,45,60,90].includes(local.sessionMinutes)?local.sessionMinutes:60));
  const [period,setPeriod]=useState<StudyPeriod>(auth.profile?.preferred_study_period??'Flexible');
  const [selectedDays,setDays]=useState(auth.profile?.preferred_study_days??[]);
  const [goals,setGoals]=useState(auth.profile?.goals??[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  async function save(event:FormEvent){event.preventDefault();if(busy||!auth.actions)return;setBusy(true);setSaved(false);setError('');
    try{await auth.actions.updateProfile({weekly_study_hours:hours,preferred_session_minutes:duration as 30|45|60|90,preferred_study_period:period,preferred_study_days:selectedDays,goals});uiPreferences.update({sessionMinutes:duration});setSaved(true);}
    catch(error){setError(authMessage(error));}finally{setBusy(false);}}
  return <form className="account-study-preferences" onSubmit={save} aria-busy={busy}>
    <div className="form-grid"><FormField label="Weekly study target (hours)"><input type="number" required min={1} max={80} value={hours} onChange={e=>{setHours(e.target.valueAsNumber);setSaved(false);}}/></FormField>
      <FormField label="New manual block duration" hint="Account default for new manual blocks. Automatic scheduling policy is unchanged."><select value={duration} onChange={e=>{setDuration(Number(e.target.value));setSaved(false);}}>{[30,45,60,90].map(value=><option key={value} value={value}>{value} minutes</option>)}</select></FormField></div>
    <FormField label="Preferred study period"><select value={period} onChange={e=>{setPeriod(e.target.value as StudyPeriod);setSaved(false);}}>{['Morning','Afternoon','Evening','Flexible'].map(value=><option key={value}>{value}</option>)}</select></FormField>
    <div><p className="form-note">Preferred days are context, not booked availability.</p><div className="chip-grid">{days.map((day,index)=><SelectableChip key={day} label={day} selected={selectedDays.includes(index+1)} disabled={busy} onChange={()=>{setSaved(false);setDays(selectedDays.includes(index+1)?selectedDays.filter(value=>value!==index+1):[...selectedDays,index+1]);}}/>)}</div></div>
    <div><h3>Academic goals</h3><div className="chip-grid">{studyGoals.map(goal=><SelectableChip key={goal} label={goal} selected={goals.includes(goal)} disabled={busy} onChange={()=>{setSaved(false);setGoals(goals.includes(goal)?goals.filter(value=>value!==goal):[...goals,goal]);}}/>)}</div></div>
    {error&&<Feedback tone="error">{error}</Feedback>}{saved&&<Feedback tone="success">Study preferences saved to your account.</Feedback>}
    <div><Button type="submit" variant="primary" loading={busy} disabled={!auth.profile}>Save study preferences</Button></div>
  </form>;
}
