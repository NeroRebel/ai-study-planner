import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext } from 'react';
import type { AuthSnapshot, AuthStore } from './authStore';
export interface AuthValue extends AuthSnapshot {
  configured:boolean; client?:SupabaseClient|null;
  actions:AuthStore|null;
}
export const AuthContext=createContext<AuthValue|null>(null);
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('Auth provider is missing.');return value;}
