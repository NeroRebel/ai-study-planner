import type { Interest, Profile, ProfilePatch, StudyGoal, StudyLevel, StudyPeriod } from '../auth/profile';
export const steps=['About you','Subjects','Preferences','Goals','Start'];
export const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export const interestOptions:Interest[]=[
  ...['Databases','Statistics','Machine Learning','Mathematics','Economics','Project Management','Cybersecurity'].map(name=>({name,type:'subject' as const})),
  ...['Data Analytics','Programming','Web Development','Languages'].map(name=>({name,type:'skill' as const})),
];
export interface SetupDraft {
  university:string;study_program:string;study_level:StudyLevel|'';study_year:string;
  interests:Interest[];goals:StudyGoal[];weekly_study_hours:number;preferred_session_minutes:30|45|60|90;
  preferred_study_period:StudyPeriod;preferred_study_days:number[];
}
export function setupDraft(profile:Profile):SetupDraft {
  return {university:profile.university||'',study_program:profile.study_program||'',study_level:profile.study_level||'',study_year:profile.study_year?.toString()||'',
    interests:profile.interests||[],goals:profile.goals||[],weekly_study_hours:profile.weekly_study_hours??10,preferred_session_minutes:profile.preferred_session_minutes??60,
    preferred_study_period:profile.preferred_study_period??'Flexible',preferred_study_days:profile.preferred_study_days||[]};
}
export function validateSetup(draft:SetupDraft,step:number) {
  if(step===1 && draft.study_year && (!/^\d+$/.test(draft.study_year)||Number(draft.study_year)<1||Number(draft.study_year)>12))return 'Enter a study year from 1 to 12, or leave it blank.';
  if(step===3 && (!Number.isInteger(draft.weekly_study_hours)||draft.weekly_study_hours<1||draft.weekly_study_hours>80))return 'Choose a weekly target from 1 to 80 hours.';
  return '';
}
export function addCustomInterest(interests:Interest[],name:string,type:Interest['type']) {
  const clean=name.trim();
  if(!clean||clean.length>80)throw new Error('Enter an interest name between 1 and 80 characters.');
  if(interests.some(item=>item.name.toLowerCase()===clean.toLowerCase()))throw new Error('This interest is already selected.');
  if(interests.length>=30)throw new Error('Select up to 30 interests.');
  return [...interests,{name:clean,type}];
}
export function stepPayload(draft:SetupDraft,step:number):ProfilePatch {
  if(step===1)return {university:draft.university.trim()||null,study_program:draft.study_program.trim()||null,study_level:draft.study_level||null,study_year:draft.study_year?Number(draft.study_year):null,onboarding_step:2};
  if(step===2)return {interests:draft.interests,onboarding_step:3};
  if(step===3)return {weekly_study_hours:draft.weekly_study_hours,preferred_session_minutes:draft.preferred_session_minutes,preferred_study_period:draft.preferred_study_period,preferred_study_days:draft.preferred_study_days,onboarding_step:4};
  return {goals:draft.goals,onboarding_step:5};
}
