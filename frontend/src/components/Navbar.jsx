import { Link, NavLink, useNavigate } from "react-router-dom";
import { CircleParking, LayoutDashboard, LogOut, Radio, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { Button } from "./ui";

function NavItem({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
          isActive ? "bg-brand-50 text-brand-600" : "text-ink-700 hover:bg-sand-100"
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {children}
    </NavLink>
  );
}

/** Small dot showing whether the live feed is attached -- doubles as proof
 *  during a demo that updates really are pushed, not polled. */
function LiveDot() {
  const { connected } = useLive();
  return (
    <span
      title={connected ? "Live updates connected" : "Reconnecting to live updates"}
      className="hidden items-center gap-1.5 rounded-full bg-sand-100 px-3 py-1.5 text-xs font-semibold text-ink-500 sm:inline-flex"
    >
      <Radio className={`h-3.5 w-3.5 ${connected ? "text-teal-500" : "text-ink-500/50"}`} />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b border-sand-200 bg-sand-50/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="mr-auto inline-flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
            <CircleParking className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight text-ink-900">
            Park<span className="text-brand-500">.in</span>
          </span>
        </Link>

        <LiveDot />

        {user ? (
          <>
            {isAdmin ? (
              <NavItem to="/admin" icon={ShieldCheck}>
                <span className="hidden sm:inline">Operations</span>
              </NavItem>
            ) : (
              <NavItem to="/dashboard" icon={LayoutDashboard}>
                <span className="hidden sm:inline">My bookings</span>
              </NavItem>
            )}
            <span className="hidden text-sm font-semibold text-ink-700 md:inline">
              {user.name.split(" ")[0]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
              Log in
            </Button>
            <Button size="sm" onClick={() => navigate("/signup")}>
              Get started
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
