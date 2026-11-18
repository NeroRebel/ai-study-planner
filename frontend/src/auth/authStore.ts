import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ApiError, createApiClient, errorMessage } from '../api/client';
export interface Profile {
  user_id:string; display_name:string; avatar_path:string|null; timezone:'Europe/Budapest';
  created_at:string; updated_at:string;
}
export interface AuthSnapshot {
  loading:boolean; session:Session|null; profile:Profile|null; avatarUrl:string|null;
  profileLoading:boolean; error:string; recovery:boolean;
}
export function authMessage(error:unknown):string {
  const message = error instanceof Error ? error.message : 'Authentication could not be completed. Please try again.';
  if (/invalid login|invalid credentials/i.test(message)) return 'Email or password is incorrect.';
  return /fetch|network|timeout/i.test(message) ? 'Cannot reach the authentication service. Check your connection and try again.' : message;
}
export function createAuthStore(client:SupabaseClient, baseUrl:string, origin:string, recoveryStorage?:Pick<Storage,"getItem"|"setItem"|"removeItem">) {
  let state:AuthSnapshot={loading:true,session:null,profile:null,avatarUrl:null,profileLoading:false,error:'',recovery:false};
  const listeners=new Set<()=>void>();let revision=0;let stopped=false;
  let subscription: {unsubscribe:()=>void}|null=null;
  const publish=(change:Partial<AuthSnapshot>)=>{state={...state,...change};listeners.forEach(fn=>fn());};
  const recoveryKey='study-planner-recovery-user';
  function accept(session:Session|null,recovery=false) {
    if(!session || (recoveryStorage?.getItem(recoveryKey) && recoveryStorage.getItem(recoveryKey)!==session.user.id))recoveryStorage?.removeItem(recoveryKey);
    if(recovery && session)recoveryStorage?.setItem(recoveryKey,session.user.id);
    const changed=state.session?.user.id!==session?.user.id;
    if(changed)revision++;
    publish({session,loading:false,recovery:session ? recovery || recoveryStorage?.getItem(recoveryKey)===session.user.id || (!changed && state.recovery):false,
      ...(changed?{profile:null,avatarUrl:null,error:''}:{} )});
  }
  async function token(expected?:string) {
    if(expected && state.session?.user.id!==expected)return null;
    const {data,error}=await client.auth.getSession();
    if(error){
      if(expected && state.session?.user.id!==expected)return null;
      throw new ApiError("Cannot refresh your session. Check your connection and try again.",503);
    }
    if(!data.session || (expected && (data.session.user.id!==expected || state.session?.user.id!==expected)))return null;
    return data.session.access_token;
  }
  async function expire(expected?:string) {
    if(expected && state.session?.user.id!==expected)return;
    accept(null);await client.auth.signOut({scope:'local'});
  }
  const api=(expected?:string)=>createApiClient(baseUrl,{getAccessToken:()=>token(expected),onUnauthorized:()=>{void expire(expected);}});
  async function refreshProfile() {
    const id=state.session?.user.id;if(!id)return;
    const current=revision;publish({profileLoading:true,error:''});
    try {
      const profile=await api(id).request<Profile>('/api/profile');
      let avatarUrl:string|null=null;
      if(profile.avatar_path){
        const {data,error}=await client.storage.from('avatars').createSignedUrl(profile.avatar_path,300);
        if(!error)avatarUrl=data.signedUrl;
      }
      if(current===revision && state.session?.user.id===id)publish({profile,avatarUrl});
    } catch(error){if(current===revision)publish({error:errorMessage(error)});}
    finally{if(current===revision)publish({profileLoading:false});}
  }
  async function initialize() {
    stopped=false;
    if(!subscription){
      subscription=client.auth.onAuthStateChange((event,session)=>{
        if(!stopped)accept(session,event==='PASSWORD_RECOVERY');
      }).data.subscription;
    }
    const initialRevision=revision;
    const {data,error}=await client.auth.getSession();
    if(stopped || revision!==initialRevision)return;
    if(error)publish({error:authMessage(error)});
    accept(data.session);
  }
  return {
    getSnapshot:()=>state,
    subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};},
    initialize,refreshProfile,token,expire,
    dispose(){stopped=true;revision++;subscription?.unsubscribe();subscription=null;},
    async signIn(email:string,password:string){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;},
    async signUp(email:string,password:string){const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:origin+'/auth/callback'}});if(error)throw error;return Boolean(data.session);},
    async signOut(){accept(null);const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;},
    async resetPassword(email:string){const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:origin+'/reset-password'});if(error)throw error;},
    async updatePassword(password:string){const {error}=await client.auth.updateUser({password});if(error)throw error;recoveryStorage?.removeItem(recoveryKey);publish({recovery:false});},
    async google(){const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:origin+'/auth/callback'}});if(error)throw error;},
    async updateProfile(values:Partial<Pick<Profile,'display_name'|'avatar_path'|'timezone'>>){
      const id=state.session?.user.id;if(!id)throw new Error('Sign in first.');
      await api(id).request<Profile>('/api/profile','PATCH',values);await refreshProfile();
    },
    async deleteAccount(confirmation:string){
      const id=state.session?.user.id;if(!id)throw new Error('Sign in first.');
      await api(id).request('/api/account','DELETE',{confirmation});
      await expire(id); // Clear local state only after confirmed server success.
    },
  };
}
export type AuthStore=ReturnType<typeof createAuthStore>;
