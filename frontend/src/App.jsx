import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LiveProvider } from "./context/LiveContext";
import { ToastProvider } from "./context/ToastContext";
import { RequireAdmin, RequireAuth } from "./components/Guards";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Lot from "./pages/Lot";
import Checkout from "./pages/Checkout";
import Ticket from "./pages/Ticket";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <LiveProvider>
          <BrowserRouter>
            <div className="flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />

                  <Route
                    path="/lot/:locationId"
                    element={
                      <RequireAuth>
                        <Lot />
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
                Park.in - smart parking for Jaipur's heritage sites
              </footer>
            </div>
          </BrowserRouter>
        </LiveProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
