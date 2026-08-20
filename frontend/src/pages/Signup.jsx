import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CircleParking } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, Field, Input } from "../components/ui";

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const { signup } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const user = await signup(form);
      toast.success(`You're in, ${user.name.split(" ")[0]}`);
      navigate(location.state?.from ?? "/", { replace: true });
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
        <h1 className="mt-4 font-display text-3xl font-bold text-ink-900">Create your account</h1>
        <p className="mt-1 text-sm text-ink-700">Takes about twenty seconds.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name" htmlFor="name">
            <Input
              id="name"
              required
              minLength={2}
              autoComplete="name"
              placeholder="Aarav Sharma"
              value={form.name}
              onChange={update("name")}
            />
          </Field>

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update("email")}
            />
          </Field>

          <Field label="Phone" htmlFor="phone" hint="Optional - used for booking reminders.">
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+91 98290 12345"
              value={form.phone}
              onChange={update("phone")}
            />
          </Field>

          <Field label="Password" htmlFor="password" hint="At least 6 characters.">
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Choose a password"
              value={form.password}
              onChange={update("password")}
            />
          </Field>

          <Button type="submit" busy={busy} className="w-full">
            {busy ? "Creating account" : "Create account"}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-ink-700">
        Already registered?{" "}
        <Link to="/login" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
