import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { partnerApi, partnerTokenStore } from "./partner-api";

export type PartnerProfile = {
  id: string;
  name: string;
  firm: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  commissionRate: string;
  createdAt: string;
};

type PartnerAuthContextValue = {
  partner: PartnerProfile | null;
  ready: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
};

const PartnerAuthContext = createContext<PartnerAuthContextValue | null>(null);

export function PartnerAuthProvider({ children }: { children: ReactNode }) {
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!partnerTokenStore.get()) {
      setReady(true);
      return;
    }
    partnerApi<PartnerProfile>("/partner/me")
      .then(setPartner)
      .catch(() => partnerTokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const login = async (phone: string, password: string) => {
    const res = await partnerApi<{ accessToken: string; partner: PartnerProfile }>(
      "/partner/auth/login",
      { method: "POST", body: JSON.stringify({ phone, password }) },
    );
    partnerTokenStore.set(res.accessToken);
    setPartner(res.partner);
  };

  const logout = () => {
    partnerTokenStore.clear();
    setPartner(null);
  };

  return (
    <PartnerAuthContext.Provider value={{ partner, ready, login, logout }}>
      {children}
    </PartnerAuthContext.Provider>
  );
}

export function usePartnerAuth() {
  const ctx = useContext(PartnerAuthContext);
  if (!ctx) throw new Error("usePartnerAuth must be used inside PartnerAuthProvider");
  return ctx;
}
