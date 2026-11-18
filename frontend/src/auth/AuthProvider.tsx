import {useEffect,useState,useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import {supabase} from './supabase';
import {createAuthStore} from './authStore';
import {AuthContext} from './AuthContext';
export function AuthProvider({children}:{children:ReactNode}) {
  const [store]=useState(()=>supabase?createAuthStore(supabase,import.meta.env.VITE_API_BASE_URL||'http://127.0.0.1:8000',window.location.origin,window.sessionStorage):null);
  const empty={loading:false,session:null,profile:null,avatarUrl:null,profileLoading:false,error:'',recovery:false};
  return store?<Connected store={store}>{children}</Connected>:<AuthContext.Provider value={{...empty,configured:false,client:null,actions:null}}>{children}</AuthContext.Provider>;
}
function Connected({store,children}:{store:ReturnType<typeof createAuthStore>;children:ReactNode}) {
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const id=snapshot.session?.user.id;
  useEffect(()=>{void store.initialize();return ()=>store.dispose();},[store]);
  useEffect(()=>{
    if(!id)return;
    void store.refreshProfile();
    const timer=setInterval(()=>{void store.refreshProfile();},240_000);
    return ()=>clearInterval(timer);
  },[id,store]);
  return <AuthContext.Provider value={{...snapshot,configured:true,client:supabase,actions:store}}>{children}</AuthContext.Provider>;
}
