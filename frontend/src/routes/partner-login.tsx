import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { usePartnerAuth } from "../lib/partner-auth";

export function PartnerLoginPage() {
  const { login } = usePartnerAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(phone, password);
      await navigate({ to: "/partner" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-gold font-bold text-navy">
            G
          </span>
          <div className="leading-tight text-white">
            <p className="font-bold">Growth Capital Services</p>
            <p className="text-xs text-white/50">Partner Portal</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="card p-6">
          <h1 className="text-base font-bold text-navy">Partner sign in</h1>
          <p className="mt-1 text-[13px] text-muted">
            Track your referrals and commission structure.
          </p>

          <label className="mt-5 block text-[13px] font-semibold text-navy">
            Phone number
            <input
              type="tel"
              required
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              autoComplete="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              className="field mt-1.5 font-normal"
              placeholder="10-digit mobile number"
            />
          </label>

          <label className="mt-4 block text-[13px] font-semibold text-navy">
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field mt-1.5 font-normal"
            />
          </label>

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-5 w-full py-2.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="mt-4 text-center text-[12px] text-muted">
            Don't have portal access yet? Contact your GCS relationship manager.
          </p>
        </form>
      </div>
    </div>
  );
}
