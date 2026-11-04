import { useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./components/LoginPage";
import StaffDashboard from "./components/StaffDashboard";
import RequestPage from "./components/RequestPage";
import TrackPage from "./components/TrackPage";
import { getMe } from "./api";
import { getToken, clearToken, setUnauthorizedHandler } from "./auth";
import { socket } from "./socket";
import "./index.css";

function Loading() {
  return <div className="login-wrap muted">Loading…</div>;
}

function AppRoutes() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const logout = useCallback(() => {
    clearToken();
    socket.disconnect();
    setUser(null);
  }, []);

  // Any 401 from the staff API drops back to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  // On load, validate any stored staff token before showing the dashboard.
  useEffect(() => {
    if (!getToken()) {
      setAuthChecked(true);
      return;
    }
    getMe()
      .then(({ user: me }) => setUser(me))
      .catch(() => clearToken())
      .finally(() => setAuthChecked(true));
  }, []);

  // The public patient pages render immediately - they never wait on the
  // staff auth check, so a slow backend can't blank them.
  return (
    <Routes>
      <Route path="/" element={<RequestPage />} />
      <Route path="/track" element={<TrackPage />} />
      <Route
        path="/staff/login"
        element={
          !authChecked ? <Loading /> : user ? <Navigate to="/staff" replace /> : <LoginPage onLoggedIn={setUser} />
        }
      />
      <Route
        path="/staff"
        element={
          !authChecked ? (
            <Loading />
          ) : user ? (
            <StaffDashboard user={user} onLogout={logout} />
          ) : (
            <Navigate to="/staff/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}