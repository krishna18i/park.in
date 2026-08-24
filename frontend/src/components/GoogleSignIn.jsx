import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import { Button } from "./ui";

const GIS_SRC = "https://accounts.google.com/gsi/client";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.96 10.96 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.72.12-1.43.34-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function GoogleSignIn({ onSignedIn }) {
  const { t } = useI18n();
  const toast = useToast();
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || "");

  useEffect(() => {
    api
      .googleConfig()
      .then((cfg) => {
        if (cfg.client_id) setClientId(cfg.client_id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId || window.google?.accounts?.id) return undefined;
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    document.head.appendChild(script);
    return undefined;
  }, [clientId]);

  const finish = async (credential) => {
    setBusy(true);
    try {
      const user = await loginWithGoogle(credential);
      toast.success(`Welcome, ${user.name.split(" ")[0]}`);
      onSignedIn?.(user);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const click = async () => {
    if (clientId && window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => finish(response.credential),
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          finish("demo");
        }
      });
      return;
    }
    await finish("demo");
  };

  return (
    <Button type="button" variant="outline" className="w-full" busy={busy} onClick={click}>
      <GoogleMark />
      {t("login.google")}
    </Button>
  );
}
