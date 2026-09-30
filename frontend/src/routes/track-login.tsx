import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useBorrowerAuth } from "../lib/borrower-auth";

export function TrackLoginPage() {
  const { login } = useBorrowerAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(phone, accessCode);
      await navigate({ to: "/track" });
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
            <p className="text-xs text-white/50">Track Your Application</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="card p-6">
          <h1 className="text-base font-bold text-navy">Track your file</h1>
          <p className="mt-1 text-[13px] text-muted">
            Enter your mobile number and the access code your advisor shared with you.
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
            Access code
            <input
              type="text"
              required
              autoComplete="off"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              className="field mt-1.5 font-normal uppercase tracking-widest"
              placeholder="e.g. QW78KB4H"
            />
          </label>

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-5 w-full py-2.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Signing in…" : "Track application"}
          </button>

          <p className="mt-4 text-center text-[12px] text-muted">
            Don't have an access code? Ask your GCS advisor for it.
          </p>
        </form>
      </div>
    </div>
  );
}
