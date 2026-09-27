import { Link, NavLink, useNavigate } from "react-router-dom";
import { Building2, CircleHelp, LayoutDashboard, LogOut, Presentation, Radio, ShieldCheck, Truck } from "lucide-react";
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
          isActive ? "bg-orange-400/15 text-orange-300 ring-1 ring-orange-300/20" : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
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
      className="hidden items-center gap-1.5 rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1.5 text-xs font-semibold text-cyan-200 sm:inline-flex"
    >
      <Radio className={`h-3.5 w-3.5 ${connected ? "text-cyan-300" : "text-slate-500"}`} />
      {connected ? t("nav.live") : t("nav.offline")}
    </span>
  );
}

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101f]/95 text-white shadow-lg shadow-slate-950/20 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link to="/" className="mr-auto inline-flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center">
            <img src="/parkin-mark.svg" alt="" className="h-10 w-10" />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight text-white">
            Park<span className="text-orange-400">.in</span>
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
            <span className="hidden text-sm font-semibold text-slate-300 md:inline">
              {user.name.split(" ")[0]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="!text-slate-300 hover:!bg-white/[0.07] hover:!text-white"
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
            <Button variant="ghost" size="sm" className="!text-slate-300 hover:!bg-white/[0.07] hover:!text-white" onClick={() => navigate("/login")}>
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
