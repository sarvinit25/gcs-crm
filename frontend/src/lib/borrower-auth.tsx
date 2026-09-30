import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { borrowerApi, borrowerTokenStore } from "./borrower-api";

export type BorrowerProfile = { applicationNo: string; loanProduct: string; status: string };

type BorrowerAuthContextValue = {
  borrower: BorrowerProfile | null;
  ready: boolean;
  login: (phone: string, accessCode: string) => Promise<void>;
  logout: () => void;
};

const BorrowerAuthContext = createContext<BorrowerAuthContextValue | null>(null);

export function BorrowerAuthProvider({ children }: { children: ReactNode }) {
  const [borrower, setBorrower] = useState<BorrowerProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!borrowerTokenStore.get()) {
      setReady(true);
      return;
    }
    borrowerApi<BorrowerProfile>("/borrower/me")
      .then(setBorrower)
      .catch(() => borrowerTokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const login = async (phone: string, accessCode: string) => {
    const res = await borrowerApi<{ accessToken: string; applicationNo: string }>(
      "/borrower/auth/login",
      { method: "POST", body: JSON.stringify({ phone, accessCode }) },
    );
    borrowerTokenStore.set(res.accessToken);
    const profile = await borrowerApi<BorrowerProfile>("/borrower/me");
    setBorrower(profile);
  };

  const logout = () => {
    borrowerTokenStore.clear();
    setBorrower(null);
  };

  return (
    <BorrowerAuthContext.Provider value={{ borrower, ready, login, logout }}>
      {children}
    </BorrowerAuthContext.Provider>
  );
}

export function useBorrowerAuth() {
  const ctx = useContext(BorrowerAuthContext);
  if (!ctx) throw new Error("useBorrowerAuth must be used inside BorrowerAuthProvider");
  return ctx;
}
