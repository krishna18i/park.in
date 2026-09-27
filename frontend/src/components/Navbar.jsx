import { Link, NavLink, useNavigate } from "react-router-dom";
import { Building2, CircleHelp, CircleParking, LayoutDashboard, LogOut, Presentation, Radio, ShieldCheck, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useLive } from "../context/LiveContext";
import { LanguageTab } from "./LanguageSwitcher";
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

function LiveDot() {
  const { connected } = useLive();
  const { t } = useI18n();
  return (
    <span
      title={connected ? "Live updates connected" : "Reconnecting to live updates"}
      className="hidden items-center gap-1.5 rounded-full bg-sand-100 px-3 py-1.5 text-xs font-semibold text-ink-500 sm:inline-flex"
    >
      <Radio className={`h-3.5 w-3.5 ${connected ? "text-teal-500" : "text-ink-500/50"}`} />
      {connected ? t("nav.live") : t("nav.offline")}
    </span>
  );
}

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b border-sand-200 bg-sand-50/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link to="/" className="mr-auto inline-flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
            <CircleParking className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight text-ink-900">
            Park<span className="text-brand-500">.in</span>
          </span>
        </Link>

        <LiveDot />
        <LanguageTab />
        <NavItem to="/help" icon={CircleHelp}>
          <span className="hidden sm:inline">{t("nav.help")}</span>
        </NavItem>

        {user ? (
          <>
            {isAdmin ? (
              <>
                <NavItem to="/showcase" icon={Presentation}>
                  <span className="hidden xl:inline">Demo</span>
                </NavItem>
                <NavItem to="/city" icon={Building2}>
                  <span className="hidden lg:inline">Command</span>
                </NavItem>
                <NavItem to="/admin" icon={ShieldCheck}>
                  <span className="hidden lg:inline">{t("nav.ops")}</span>
                </NavItem>
              </>
            ) : (
              <>
                <NavItem to="/logistics" icon={Truck}>
                  <span className="hidden lg:inline">Logistics</span>
                </NavItem>
                <NavItem to="/dashboard" icon={LayoutDashboard}>
                  <span className="hidden sm:inline">{t("nav.bookings")}</span>
                </NavItem>
              </>
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
              <span className="hidden sm:inline">{t("nav.signout")}</span>
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
              {t("nav.login")}
            </Button>
            <Button size="sm" onClick={() => navigate("/signup")}>
              {t("nav.signup")}
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
