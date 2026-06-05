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
            <Route element={<AppShell />}>
              <Route index element={<TasksPage />} />
              <Route path="/tasks/new" element={<TaskFormPage />} />
              <Route path="/tasks/:id/edit" element={<TaskFormPage />} />
              <Route path="/likes" element={<LikesPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
