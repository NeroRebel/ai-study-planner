import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { isProjectUrl, isPublishableKey } from './src/auth/publicConfig.ts'

export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd(),'VITE_')
  for(const [name,value] of Object.entries(env)) {
    if(value && /VITE_.*(SERVICE_ROLE|SECRET|DATABASE)/i.test(name))throw new Error('Backend secrets must never be configured as VITE variables.')
  }
  if(env.VITE_SUPABASE_URL && !isProjectUrl(env.VITE_SUPABASE_URL))throw new Error('Supabase URL must be an HTTPS project origin without credentials.')
  if(env.VITE_SUPABASE_PUBLISHABLE_KEY && !isPublishableKey(env.VITE_SUPABASE_PUBLISHABLE_KEY))throw new Error('Only a Supabase publishable or legacy anon key is allowed in frontend configuration.')
  return {plugins:[react()]}
})
