import { useMemo, lazy, Suspense } from "react";
import { AuthGate } from "./auth/AuthGate";
import { AuthPage } from "./auth/AuthPage";
import { useAuth } from "./auth/AuthContext";
import { createApi } from "./api";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppDataProvider } from "./state/AppDataProvider";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { TasksPage } from "./pages/TasksPage";
import { SubjectsPage } from "./pages/SubjectsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DeadlinesPage } from "./pages/DeadlinesPage";
import { ProgressPage } from "./pages/ProgressPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AssistantPage } from "./pages/AssistantPage";
import { NotFoundPage } from "./pages/NotFoundPage";

const AuthProvider = lazy(async () => ({ default: (await import("./auth/AuthProvider")).AuthProvider }));

export default function App() {
  return (
    <Suspense fallback={<div className="auth-shell" role="status">Restoring your session…</div>}><AuthProvider><BrowserRouter><Routes>
      {(["sign-in","sign-up","forgot-password","reset-password","check-email"] as const).map(mode=><Route key={mode} path={"/"+mode} element={<AuthPage mode={mode} />} />)}
      <Route path="/auth/callback" element={<AuthPage mode="callback" />} />
      <Route path="/*" element={<AuthGate><Workspace /></AuthGate>} />
    </Routes></BrowserRouter></AuthProvider></Suspense>
  );
}

function Workspace() {
  const auth=useAuth();
  const id=auth.session!.user.id;
  const api=useMemo(()=>createApi(import.meta.env.VITE_API_BASE_URL||"http://127.0.0.1:8000",{
    getAccessToken:()=>auth.actions!.token(id),onUnauthorized:()=>{void auth.actions!.expire(id);},
  }),[id,auth.actions]);
  return <AppDataProvider key={id} api={api} displayName={auth.profile?.display_name||"Student"}>
    <Routes><Route element={<AppLayout />}>
      <Route index element={<DashboardPage />} /><Route path="tasks" element={<TasksPage />} />
      <Route path="subjects" element={<SubjectsPage />} /><Route path="calendar" element={<CalendarPage />} />
      <Route path="deadlines" element={<DeadlinesPage />} /><Route path="progress" element={<ProgressPage />} />
      <Route path="settings" element={<SettingsPage />} /><Route path="assistant" element={<AssistantPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route></Routes>
  </AppDataProvider>;
}
