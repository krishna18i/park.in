import { lazy, Suspense, useCallback, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { I18nProvider } from "./context/I18nContext";
import { LiveProvider } from "./context/LiveContext";
import { ToastProvider } from "./context/ToastContext";
import { RequireAdmin, RequireAuth } from "./components/Guards";
import Navbar from "./components/Navbar";
import ParkinFooter from "./components/ParkinFooter";
import AppSplash from "./components/AppSplash";
import ScrollToTop from "./components/ScrollToTop";
import { LanguagePrompt } from "./components/LanguageSwitcher";
import { Spinner } from "./components/ui";
import Home from "./pages/Home";

const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Lot = lazy(() => import("./pages/Lot"));
const NearbyPlaces = lazy(() => import("./pages/NearbyPlaces"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Ticket = lazy(() => import("./pages/Ticket"));
const Feedback = lazy(() => import("./pages/Feedback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const Help = lazy(() => import("./pages/Help"));
const CityCommand = lazy(() => import("./pages/CityCommand"));
const Logistics = lazy(() => import("./pages/Logistics"));
const Showcase = lazy(() => import("./pages/Showcase"));

/** Asks for a language the moment someone signs in, before they go anywhere. */
function LanguageGate() {
  const { justSignedIn, clearJustSignedIn } = useAuth();
  return <LanguagePrompt open={justSignedIn} onClose={clearJustSignedIn} />;
}

function Shell() {
  const [showSplash, setShowSplash] = useState(true);
  const finishSplash = useCallback(() => setShowSplash(false), []);
  return (
    <BrowserRouter>
      <ScrollToTop />
      {showSplash && <AppSplash onDone={finishSplash} />}
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <LanguageGate />
        <main className="flex-1">
          <Suspense fallback={<Spinner label="Opening Park.in" />}>
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
              path="/logistics"
              element={
                <RequireAuth>
                  <Logistics />
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
            <Route
              path="/city"
              element={
                <RequireAdmin>
                  <CityCommand />
                </RequireAdmin>
              }
            />
            <Route
              path="/showcase"
              element={
                <RequireAdmin>
                  <Showcase />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </main>
        <ParkinFooter />
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
