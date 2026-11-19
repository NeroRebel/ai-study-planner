import type {ReactNode} from 'react';
import {Navigate,useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {LoadingState} from '../components/common/LoadingState';
import {Feedback} from '../components/common/Feedback';
import {OnboardingPage} from './OnboardingPage';

export function OnboardingGate({children}:{children:ReactNode}) {
  const auth=useAuth(),location=useLocation();
  const own=auth.profile && auth.profile.user_id===auth.session?.user.id;
  if(!own || typeof auth.profile?.onboarding_completed!=='boolean')return <div className="auth-shell">
    {auth.error?<Feedback tone="error" action={<button className="button" onClick={()=>{void auth.actions?.refreshProfile();}}>Retry profile</button>}>{auth.error}</Feedback>:
      <LoadingState title="Loading your workspace" description="Checking your saved setup…"/>}
  </div>;
  if(!auth.profile.onboarding_completed)return location.pathname==='/onboarding'?<OnboardingPage key={auth.profile.user_id}/>:<Navigate replace to="/onboarding"/>;
  if(location.pathname==='/onboarding')return <Navigate replace to={auth.profile.onboarding_start_mode==='ai'?'/assistant?setup=1':'/'}/>;
  return <>{children}</>;
}
