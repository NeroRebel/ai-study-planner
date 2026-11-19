import {useState} from 'react';
import type {FormEvent} from 'react';
import {Link,Navigate,useNavigate,useLocation} from 'react-router-dom';
import {BrandMark} from '../components/common/BrandMark';
import {useAuth} from './AuthContext';
import {authMessage} from './authStore';
import { motion } from 'motion/react';

export function AuthPage({mode}:{mode:'sign-in'|'sign-up'|'forgot-password'|'reset-password'|'check-email'|'callback'}) {
  const auth=useAuth(),navigate=useNavigate(),location=useLocation();
  const invalidLink=new URLSearchParams(location.search).has("error") || new URLSearchParams(location.hash.slice(1)).has("error");
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const title={'sign-in':'Welcome back','sign-up':'Create your account','forgot-password':'Reset your password','reset-password':'Choose a new password','check-email':'Check your email',callback:'Completing sign-in'}[mode];
  if(auth.loading)return <div className="auth-shell" role="status">Restoring your session…</div>;
  if(mode==='callback')return auth.session&&!invalidLink?<Navigate replace to={auth.recovery?'/reset-password':'/'} />:<AuthFrame title="Sign-in link could not be verified"><p>Request a new email link or sign in again. Open confirmation links in the browser where you started.</p><Link to="/sign-in">Sign in</Link></AuthFrame>;
  if(auth.session && ['sign-in','sign-up'].includes(mode))return <Navigate replace to={auth.recovery?'/reset-password':'/'} />;
  async function submit(event:FormEvent){
    event.preventDefault();if(!auth.actions || busy)return;
    setBusy(true);setError('');
    try {
      if(mode==='sign-in')await auth.actions.signIn(email,password);
      if(mode==='sign-up'){const immediate=await auth.actions.signUp(email,password);navigate(immediate?'/':'/check-email');}
      if(mode==='forgot-password'){await auth.actions.resetPassword(email);navigate('/check-email');}
      if(mode==='reset-password'){
        if(password!==repeat)throw new Error('Passwords must match.');
        await auth.actions.updatePassword(password);navigate('/');
      }
    }catch(error){setError(authMessage(error));}finally{setBusy(false);}
  }
  return <AuthFrame title={title}>
    {!auth.configured?<p role="alert">Sign-in is not configured. See the project authentication setup guide.</p>:
      mode==='check-email'?<><p>If an email can be sent for this address, it will contain a confirmation or password-recovery link. Check your inbox and spam folder.</p><Link to="/sign-in">Back to sign in</Link></>:
      mode==='reset-password'&&(!auth.session||!auth.recovery||invalidLink)?<><p>Open the recovery link from your email to choose a new password.</p><Link to="/forgot-password">Request a new link</Link></>:
      <form className="editor-form" onSubmit={submit} aria-busy={busy}>
        {mode!=='reset-password'&&<label className="form-field">Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>}
        {mode!=='forgot-password'&&<label className="form-field">Password<input type="password" required minLength={mode==='sign-in'?1:8} autoComplete={mode==='sign-in'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} /></label>}
        {mode==='reset-password'&&<label className="form-field">Confirm password<input type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)} /></label>}
        {['sign-up','reset-password'].includes(mode)&&<p className="form-note">Use at least 8 characters and a unique password.</p>}
        {error&&<p role="alert" className="form-error">{error}</p>}
        <button className="button button-primary" disabled={busy}>{busy?'Please wait…':mode==='sign-in'?'Sign in':mode==='sign-up'?'Create account':mode==='forgot-password'?'Send recovery email':'Update password'}</button>
        {['sign-in','sign-up'].includes(mode)&&<button className="button" type="button" disabled={busy} onClick={async()=>{
          setBusy(true);try{await auth.actions?.google();}catch(error){setError(authMessage(error));}finally{setBusy(false);}
        }}>Continue with Google</button>}
        {mode==='sign-in'&&<><Link to="/forgot-password">Forgot password?</Link><Link to="/sign-up">Create an account</Link></>}
        {mode!=='sign-in'&&<Link to="/sign-in">Back to sign in</Link>}
      </form>}
  </AuthFrame>;
}
function AuthFrame({title,children}:{title:string;children:React.ReactNode}) {
  return <main className="auth-shell"><motion.section initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.24}} className="panel auth-card"><div className="brand"><BrandMark /> AI Study Planner</div><h1>{title}</h1><p className="muted">Make time for what matters.</p>{children}</motion.section></main>;
}
