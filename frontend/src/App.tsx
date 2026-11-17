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
import { AssistantPage } from "./pages/AssistantPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  return (
    <AppDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="deadlines" element={<DeadlinesPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppDataProvider>
  );
}
