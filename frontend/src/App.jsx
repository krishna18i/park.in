import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { I18nProvider, useI18n } from "./context/I18nContext";
import { LiveProvider } from "./context/LiveContext";
import { ToastProvider } from "./context/ToastContext";
import { RequireAdmin, RequireAuth } from "./components/Guards";
import Navbar from "./components/Navbar";
import { LanguagePrompt } from "./components/LanguageSwitcher";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Lot from "./pages/Lot";
import NearbyPlaces from "./pages/NearbyPlaces";
import Checkout from "./pages/Checkout";
import Ticket from "./pages/Ticket";
import Feedback from "./pages/Feedback";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Help from "./pages/Help";

/** Asks for a language the moment someone signs in, before they go anywhere. */
function LanguageGate() {
  const { justSignedIn, clearJustSignedIn } = useAuth();
  return <LanguagePrompt open={justSignedIn} onClose={clearJustSignedIn} />;
}

function Shell() {
  const { t } = useI18n();
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <LanguageGate />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/help" element={<Help />} />
            <Route
              path="/lot/:locationId"
              element={
                <RequireAuth>
                  <Lot />
                </RequireAuth>
              }
            />
            <Route
              path="/lot/:locationId/around/:category"
              element={
                <RequireAuth>
                  <NearbyPlaces />
                </RequireAuth>
              }
            />
            <Route
              path="/checkout/:bookingId"
              element={
                <RequireAuth>
                  <Checkout />
                </RequireAuth>
              }
            />
            <Route
              path="/ticket/:bookingId"
              element={
                <RequireAuth>
                  <Ticket />
                </RequireAuth>
              }
            />
            <Route
              path="/feedback/:bookingId"
              element={
                <RequireAuth>
                  <Feedback />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="border-t border-sand-200 py-6 text-center text-xs text-ink-500">
          {t("footer")}
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <I18nProvider>
        <AuthProvider>
          <LiveProvider>
            <Shell />
          </LiveProvider>
        </AuthProvider>
      </I18nProvider>
    </ToastProvider>
  );
}
