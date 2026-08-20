import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CircleParking, ShieldCheck, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, Field, Input } from "../components/ui";

// Seeded by the backend on first boot. One click fills the form so a demo
// never stalls on someone mistyping a password.
const DEMO_LOGINS = [
  { icon: User, label: "Driver", email: "demo@parkin.app", password: "demo123" },
  { icon: ShieldCheck, label: "Operator", email: "admin@parkin.app", password: "admin123" },
];

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}`);
      navigate(user.role === "admin" ? "/admin" : (location.state?.from ?? "/dashboard"), {
        replace: true,
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-6 py-14">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/30">
          <CircleParking className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold text-ink-900">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-700">Sign in to reserve and manage your bays.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Your password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>

          <Button type="submit" busy={busy} className="w-full">
            {busy ? "Signing in" : "Sign in"}
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-500">
          Demo accounts
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO_LOGINS.map(({ icon: Icon, label, email, password }) => (
            <button
              key={email}
              type="button"
              onClick={() => setForm({ email, password })}
              className="flex flex-col items-center gap-1 rounded-xl border-2 border-sand-200 px-3 py-3 text-center transition hover:border-brand-300 hover:bg-brand-50"
            >
              <Icon className="h-4 w-4 text-brand-500" />
              <span className="text-sm font-semibold text-ink-900">{label}</span>
              <span className="text-[11px] text-ink-500">{email}</span>
            </button>
          ))}
        </div>
      </Card>

      <p className="text-center text-sm text-ink-700">
        New here?{" "}
        <Link to="/signup" className="font-semibold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
