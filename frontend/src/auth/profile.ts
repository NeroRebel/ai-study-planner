export type StudyLevel = 'Bachelor' | 'Master' | 'PhD' | 'Other';
export type StudyPeriod = 'Morning' | 'Afternoon' | 'Evening' | 'Flexible';
export interface Interest { name: string; type: 'subject' | 'skill'; }
export const studyGoals = ['Stay ahead of deadlines','Pass exams','Improve grades','Build practical skills','Prepare for internship','Create a consistent study routine','Reduce procrastination'] as const;
export type StudyGoal = typeof studyGoals[number];
export interface Profile {
  user_id:string; display_name:string; avatar_path:string|null; timezone:'Europe/Budapest';
  university:string|null; study_program:string|null; study_level:StudyLevel|null; study_year:number|null;
  weekly_study_hours:number|null; preferred_session_minutes:30|45|60|90|null;
  preferred_study_period:StudyPeriod|null; preferred_study_days:number[]; interests:Interest[]; goals:StudyGoal[];
  onboarding_step:number; onboarding_completed:boolean; onboarding_skipped:boolean;
  onboarding_start_mode:'manual'|'ai'|null; onboarding_completed_at:string|null;
  created_at:string; updated_at:string;
}
export type ProfilePatch = Partial<Pick<Profile,'display_name'|'avatar_path'|'timezone'|'university'|'study_program'|'study_level'|'study_year'|'weekly_study_hours'|'preferred_session_minutes'|'preferred_study_period'|'preferred_study_days'|'interests'|'goals'|'onboarding_step'>>;
export interface OnboardingFinish { start_mode:'manual'|'ai'; create_subjects:boolean; skip:boolean; subject_names?:string[]; }
