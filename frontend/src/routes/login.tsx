import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login, verifyTwoFactor, cancelTwoFactor } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "password") {
        const result = await login(email, password);
        if (result === "two-factor") {
          setStep("code");
          return;
        }
      } else {
        await verifyTwoFactor(code);
      }
      await navigate({ to: "/" });
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
            <p className="text-xs text-white/50">CRM back office</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="card dialog-enter p-6">
          <h1 className="text-base font-bold text-navy">{step === "code" ? "Two-step verification" : "Sign in"}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {step === "code" ? "Open your authenticator app and enter the 6-digit code." : "Staff accounts only."}
          </p>

          {step === "password" ? (
            <>
              <label className="mt-5 block text-[13px] font-semibold text-navy">
                Email
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field mt-1.5 font-normal"
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
            </>
          ) : (
            <label className="mt-5 block text-[13px] font-semibold text-navy">
              Authentication code
              <input
                autoFocus
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123 456"
                className="field mt-1.5 text-center font-mono text-lg tracking-[0.3em]"
              />
            </label>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-5 w-full py-2.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Checking…" : step === "code" ? "Verify and sign in" : "Sign in"}
          </button>
          {step === "code" && (
            <button
              type="button"
              onClick={() => {
                cancelTwoFactor();
                setStep("password");
                setCode("");
                setError(null);
              }}
              className="mt-3 w-full text-center text-[13px] font-semibold text-muted hover:text-navy"
            >
              Use a different account
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
