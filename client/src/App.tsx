/**
 * Routes:
 * - /login, /signup — guests only
 * - /, /tasks/* — to-dos (achieve → tokens)
 * - /likes — things you enjoy (spin tokens → maybe win one)
 * - /calendar — day view of do/due dates
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GuestRoute } from "./components/GuestRoute";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { TasksPage } from "./pages/TasksPage";
import { TaskFormPage } from "./pages/TaskFormPage";
import { LikesPage } from "./pages/LikesPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DailySettingsPage } from "./pages/DailySettingsPage";
import { VisionsPage } from "./pages/VisionsPage";
import { VisionFormPage } from "./pages/VisionFormPage";
import { VisionChainPage } from "./pages/VisionChainPage";
import { AiPage } from "./pages/AiPage";
import { WelcomePage } from "./pages/WelcomePage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route element={<AppShell />}>
              <Route index element={<TasksPage />} />
              <Route path="/tasks/new" element={<TaskFormPage />} />
              <Route path="/tasks/:id/edit" element={<TaskFormPage />} />
              <Route path="/likes" element={<LikesPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/daily-settings" element={<DailySettingsPage />} />
              <Route path="/visions" element={<VisionsPage />} />
              <Route path="/visions/new" element={<VisionFormPage />} />
              <Route path="/visions/:id/edit" element={<VisionFormPage />} />
              <Route path="/visions/:id/chain" element={<VisionChainPage />} />
              <Route path="/ai" element={<AiPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
