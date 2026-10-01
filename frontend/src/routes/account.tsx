import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { api, tokenStore } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../lib/types";
import { PageHeader } from "../components/app-shell";

/** Sets a new password. Used on the Account page and as the screen a new account is forced through. */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const change = useMutation({
    mutationFn: () => api<{ accessToken: string }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) }),
    onSuccess: (done) => {
      // Changing the password signs out every other session; this one carries on with the fresh token.
      tokenStore.set(done.accessToken);
      setCurrent("");
      setNext("");
      setAgain("");
      onDone?.();
    },
  });
  const mismatch = again.length > 0 && again !== next;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (next === again) change.mutate();
      }}
      className="space-y-3"
    >
      <label className="block text-[13px] font-semibold text-navy">
        Current password
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="field mt-1.5 font-normal" />
      </label>
      <label className="block text-[13px] font-semibold text-navy">
        New password
        <input type="password" required minLength={10} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="field mt-1.5 font-normal" />
        <span className="mt-1 block text-[12px] font-normal text-muted">At least 10 characters. A few random words is stronger than clever symbols.</span>
      </label>
      <label className="block text-[13px] font-semibold text-navy">
        Type it again
        <input type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="field mt-1.5 font-normal" />
      </label>
      {mismatch && <p className="text-[13px] text-red-600">The two passwords don't match.</p>}
      {change.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(change.error as Error).message}</p>}
      {change.isSuccess && (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Password changed.
        </p>
      )}
      <button type="submit" disabled={change.isPending || mismatch} className="btn-primary">
        {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Change password
      </button>
    </form>
  );
}

function TwoFactor() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const start = useMutation({
    mutationFn: async () => {
      const res = await api<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", { method: "POST" });
      return { secret: res.secret, qr: await QRCode.toDataURL(res.otpauthUrl, { margin: 1, width: 192 }) };
    },
    onSuccess: setSetup,
  });
  const enable = useMutation({
    mutationFn: () => api("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
    onSuccess: async () => {
      setSetup(null);
      setCode("");
      await refresh();
    },
  });
  const disable = useMutation({
    mutationFn: () => api<{ accessToken: string }>("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password, code }) }),
    onSuccess: async (done) => {
      tokenStore.set(done.accessToken);
      setPassword("");
      setCode("");
      await refresh();
    },
  });

  if (user?.twoFactorEnabled) {
    return (
      <div>
        <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
          <ShieldCheck className="h-4 w-4" /> Two-step login is on
        </p>
        <p className="mt-1 text-[13px] text-muted">Signing in needs your password and a code from your authenticator app.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate();
          }}
          className="mt-4 max-w-sm space-y-3"
        >
          <p className="text-[12px] font-semibold text-muted">To turn it off, confirm it's you</p>
          <input type="password" required placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
          <input required inputMode="numeric" placeholder="6-digit code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="field font-mono tracking-widest" />
          {disable.isError && <p className="text-[13px] text-red-600">{(disable.error as Error).message}</p>}
          <button type="submit" disabled={disable.isPending} className="btn-ghost">
            {disable.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
            Turn off two-step login
          </button>
        </form>
      </div>
    );
  }

  if (setup) {
    return (
      <div className="max-w-md">
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
          <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</li>
          <li>Scan this code, or type the key in by hand.</li>
          <li>Enter the 6-digit code it shows, to confirm.</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <img src={setup.qr} alt="Scan with your authenticator app" className="h-48 w-48 rounded-lg border border-line" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Key for manual entry</p>
            <p className="mt-1 font-mono text-[13px] break-all text-navy">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enable.mutate();
          }}
          className="mt-4 flex max-w-sm items-start gap-2"
        >
          <input autoFocus required inputMode="numeric" placeholder="6-digit code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="field font-mono tracking-widest" />
          <button type="submit" disabled={enable.isPending} className="btn-primary shrink-0">
            {enable.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Turn on
          </button>
        </form>
        {enable.isError && <p className="mt-2 text-[13px] text-red-600">{(enable.error as Error).message}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px] text-muted">
        Add a second lock to your account: after your password, sign-in also asks for a 6-digit code from an app on your phone.
        Even if someone learns your password, they can't get in.
      </p>
      {start.isError && <p className="mt-2 text-[13px] text-red-600">{(start.error as Error).message}</p>}
      <button onClick={() => start.mutate()} disabled={start.isPending} className="btn-primary mt-4">
        {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Set up two-step login
      </button>
    </div>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${ROLE_LABEL[user.role]} · ${user.email}`} />
      <div className="grid gap-5 px-6 py-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-bold text-navy">Password</h2>
          <div className="mt-4 max-w-sm">
            <ChangePasswordForm />
          </div>
        </section>
        <section className="card p-5">
          <h2 className="text-sm font-bold text-navy">Two-step login</h2>
          <div className="mt-4">
            <TwoFactor />
          </div>
        </section>
      </div>
    </>
  );
}

/** Shown instead of the app until a person with an admin-issued password chooses their own. */
export function ForcePasswordChange() {
  const { user, refresh, logout } = useAuth();
  return (
    <div className="grid min-h-full place-items-center bg-navy px-4 py-10">
      <div className="card dialog-enter w-full max-w-sm p-6">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gold-pale text-gold-dark">
          <KeyRound className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-base font-bold text-navy">Choose your own password</h1>
        <p className="mt-1 text-[13px] text-muted">
          {user?.name?.split(" ")[0]}, the password you signed in with was issued to you. Pick one only you know before you start.
        </p>
        <div className="mt-5">
          <ChangePasswordForm onDone={() => void refresh()} />
        </div>
        <button onClick={logout} className="mt-4 w-full text-center text-[13px] font-semibold text-muted hover:text-navy">
          Sign out
        </button>
      </div>
    </div>
  );
}
