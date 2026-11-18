import {useState} from 'react';
import type {FormEvent} from 'react';
import {useAuth} from './AuthContext';
import {authMessage} from './authStore';
import {replaceAvatar,removeAvatar} from './avatars';
import {Panel} from '../components/common/Panel';

export function ProfileAvatar({className='avatar'}:{className?:string}) {
  const {profile,avatarUrl}=useAuth();const name=profile?.display_name||'Student';
  return <span className={className}>{avatarUrl?<img className="profile-image" src={avatarUrl} alt={name+' avatar'} referrerPolicy="no-referrer" />:name.split(' ').map(p=>p[0]).slice(0,2).join('')}</span>;
}
export function ProfilePanel() {
  const auth=useAuth();
  const supabase=auth.client;
  const [name,setName]=useState<string|null>(null),[confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  async function run(action:()=>Promise<unknown>){
    if(busy)return;setBusy(true);setError('');setSuccess('');
    try{await action();setSuccess('Account updated.');}catch(error){setError(authMessage(error));}finally{setBusy(false);}
  }
  async function save(event:FormEvent){event.preventDefault();await run(async()=>{
    if(!name?.trim()&&!auth.profile?.display_name)throw new Error('Enter your display name.');
    await auth.actions?.updateProfile({display_name:(name??auth.profile?.display_name??'').trim()});
  });}
  return <Panel title="Account" subtitle="Your private student workspace">
    <div className="profile-account"><ProfileAvatar /><div><strong>{auth.profile?.display_name||'Student'}</strong><p className="muted">{auth.session?.user.email}</p></div></div>
    {auth.profileLoading&&<p role="status">Loading your profile…</p>}
    {auth.error&&<p role="alert" className="form-error">{auth.error} <button type="button" className="text-button" onClick={()=>{void auth.actions?.refreshProfile();}}>Retry profile</button></p>}
    <form onSubmit={save} className="editor-form">
      <label className="form-field">Display name<input required maxLength={80} value={name??auth.profile?.display_name??''} onChange={e=>setName(e.target.value)} /></label>
      <label className="form-field">Timezone<select disabled aria-label="Profile timezone"><option>Europe/Budapest</option></select></label>
      <p className="form-note">Planner times currently use Budapest. Other timezones are not supported yet.</p>
      <button className="button button-primary" disabled={busy||!auth.profile}>Save profile</button>
    </form>
    <div className="form-actions">
      <label className="button">Change avatar<input className="sr-only" aria-label="Choose avatar" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||!auth.profile} onChange={e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file||!supabase||!auth.session)return;
        void run(()=>replaceAvatar(supabase!,auth.session!.user.id,file,auth.profile?.avatar_path??null,path=>auth.actions!.updateProfile({avatar_path:path})));
      }} /></label>
      <button type="button" className="button" disabled={busy||!auth.profile?.avatar_path} onClick={()=>{if(supabase)void run(()=>removeAvatar(supabase!,auth.profile?.avatar_path??null,path=>auth.actions!.updateProfile({avatar_path:path})));}}>Remove avatar</button>
      <button type="button" className="button" disabled={busy} onClick={()=>{void run(async()=>{await auth.actions?.signOut();});}}>Sign out</button>
    </div>
    <details className="account-danger"><summary>Delete account</summary>
      <p>This permanently deletes your account, subjects, tasks, sessions, availability and avatar. This cannot be undone.</p>
      <label className="form-field">Type DELETE to confirm<input value={confirmation} autoComplete="off" onChange={e=>setConfirmation(e.target.value)} /></label>
      <button type="button" className="button" disabled={busy||confirmation!=='DELETE'} onClick={()=>{void run(async()=>{await auth.actions?.deleteAccount(confirmation);});}}>Permanently delete account</button>
    </details>
    {error&&<p role="alert" className="form-error">{error}</p>}{success&&<p role="status" className="success-note">{success}</p>}
  </Panel>;
}
