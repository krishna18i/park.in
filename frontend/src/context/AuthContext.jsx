import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` guards the first render: without it the router would bounce a
  // signed-in user to /login while their token is still being validated.
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));
  // True only after an explicit sign-in this session, so the language prompt
  // never fires on a plain page reload that restored a saved token.
  const [justSignedIn, setJustSignedIn] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) return;

    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        tokenStore.clear();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback((session) => {
    tokenStore.set(session.token);
    setUser(session.user);
    setJustSignedIn(true);
    return session.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      justSignedIn,
      clearJustSignedIn: () => setJustSignedIn(false),
      isAdmin: user?.role === "admin",
      login: async (email, password) => adopt(await api.login({ email, password })),
      loginWithGoogle: async (credential) => adopt(await api.googleLogin(credential)),
      signup: async (data) => adopt(await api.signup(data)),
      logout: () => {
        tokenStore.clear();
        setUser(null);
        setJustSignedIn(false);
      },
    }),
    [user, loading, justSignedIn, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
