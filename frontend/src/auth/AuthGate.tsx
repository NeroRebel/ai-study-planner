import type {ReactNode} from 'react';
import {Navigate} from 'react-router-dom';
import {useAuth} from './AuthContext';
export function AuthGate({children}:{children:ReactNode}) {
  const auth=useAuth();
  if(auth.loading)return <div className="auth-shell" role="status">Restoring your session…</div>;
  if(!auth.session)return <Navigate to="/sign-in" replace />;
  if(auth.recovery)return <Navigate to="/reset-password" replace />;
  return <>{children}</>;
}
