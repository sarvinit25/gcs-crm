import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "./api";
import type { AuthUser } from "./types";

type Session = { accessToken: string; user: AuthUser };
type LoginResult = Session | { twoFactorRequired: true; challengeToken: string };

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  /** Resolves to "two-factor" when a code from the authenticator app is still needed. */
  login: (email: string, password: string) => Promise<"done" | "two-factor">;
  verifyTwoFactor: (code: string) => Promise<void>;
  /** Drops a half-finished two-step sign-in (back to the password step). */
  cancelTwoFactor: () => void;
  refresh: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const finish = (s: Session) => {
    tokenStore.set(s.accessToken);
    setUser(s.user);
    setChallenge(null);
  };

  const login = async (email: string, password: string) => {
    const res = await api<LoginResult>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if ("twoFactorRequired" in res) {
      setChallenge(res.challengeToken);
      return "two-factor" as const;
    }
    finish(res);
    return "done" as const;
  };

  const verifyTwoFactor = async (code: string) => {
    if (!challenge) throw new Error("Your sign-in expired — enter your password again");
    finish(await api<Session>("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ challengeToken: challenge, code }) }));
  };

  const refresh = async () => setUser(await api<AuthUser>("/auth/me"));

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, verifyTwoFactor, cancelTwoFactor: () => setChallenge(null), refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
