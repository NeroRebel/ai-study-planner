import { isProjectUrl, isPublishableKey } from './publicConfig';
import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Only a public publishable/legacy anon key belongs in browser configuration.
export const supabase = url && key && isProjectUrl(url) && isPublishableKey(key) ? createClient(url, key, {auth:{
  flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,
}}) : null;
