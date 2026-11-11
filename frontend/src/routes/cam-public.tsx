import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Lock, Phone, ShieldCheck } from "lucide-react";
import { LogoMark } from "../components/logo";
import { CamForm } from "../components/cam-form";
import type { CamData, CamSection } from "../lib/cam";

type Company = { name: string; phone: string; email: string };
type Closed = { state: "submitted" | "expired" | "revoked"; company: Company; firstName: string };
type Open = { state: "open"; company: Company; firstName: string; familyLabel: string; expiresAt: string | null; sections: CamSection[]; data: CamData; progress: number; missing: { section: string; label: string }[] };

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/crm/api/public/cam/${encodeURIComponent(token)}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message ?? "Something went wrong. Please try again.");
  }
  return body as T;
}

function Frame({ company, children }: { company?: Company; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-bg-light">
      <header className="bg-navy px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <LogoMark size="md" />
          <span className="text-sm font-bold text-white">{company?.name ?? "Growth Capital Services"}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-[12px] text-muted">
        <Lock className="mr-1 inline h-3 w-3" />This page is private to you. {company?.phone ? <>Need help? Call <a className="font-semibold text-navy" href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>.</> : null}
      </footer>
    </div>
  );
}

/** The customer's side of the CAM: no login, the link is the credential. Saves as they go; sent in with one button. */
export function CamPublicPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const [view, setView] = useState<Open | Closed | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<CamData>({});
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<CamData>({});

  useEffect(() => {
    call<Open | Closed>(token, "").then((v) => { setView(v); if (v.state === "open") { setData(v.data); latest.current = v.data; } }).catch((e: Error) => setLoadError(e.message));
  }, [token]);

  const persist = useCallback(async () => {
    setSaved("saving");
    try { await call(token, "", { method: "PUT", body: JSON.stringify({ data: latest.current }) }); setSaved("saved"); } catch { setSaved("error"); }
  }, [token]);

  // saves a moment after the customer stops typing, so closing the page loses nothing
  const change = (section: string, key: string, value: unknown) => {
    const next = { ...latest.current, [section]: { ...(latest.current[section] ?? {}), [key]: value } };
    latest.current = next;
    setData(next);
    setSaved("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, 1500);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    if (timer.current) clearTimeout(timer.current);
    try { await call(token, "/submit", { method: "POST", body: JSON.stringify({ data: latest.current }) }); setDone(true); }
    catch (e) { setSubmitError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  if (loadError) return <Frame><div className="card p-6 text-center"><h1 className="text-base font-bold text-navy">This link is not valid</h1><p className="mt-2 text-sm text-muted">{loadError} Please ask us to send you a new one.</p></div></Frame>;
  if (!view) return <Frame><div className="grid place-items-center py-24"><Loader2 className="h-5 w-5 animate-spin text-navy" /></div></Frame>;

  if (done || view.state === "submitted") {
    return (
      <Frame company={view.company}>
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-3 text-lg font-bold text-navy">Thank you, {view.firstName}</h1>
          <p className="mt-2 text-sm text-muted">We have your details. Our team will go through them and get in touch with you shortly.</p>
          {view.company.phone && <p className="mt-4 text-sm"><Phone className="mr-1 inline h-4 w-4" /><a className="font-semibold text-navy" href={`tel:${view.company.phone.replace(/\s/g, "")}`}>{view.company.phone}</a></p>}
        </div>
      </Frame>
    );
  }
  if (view.state !== "open") {
    return <Frame company={view.company}><div className="card p-6 text-center"><h1 className="text-base font-bold text-navy">This link is no longer active</h1><p className="mt-2 text-sm text-muted">Please ask us for a new one and we will send it right away.</p></div></Frame>;
  }

  return (
    <Frame company={view.company}>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-navy">Hello {view.firstName}</h1>
        <p className="mt-1 text-sm text-muted">Please fill in your details for your {view.familyLabel.toLowerCase()}. It saves as you go, so you can close this page and come back to the same link. Questions marked * are the ones we need most.</p>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted"><ShieldCheck className="h-3.5 w-3.5" /> Your details are seen only by our team.</p>
      </div>

      <CamForm sections={view.sections} data={data} onChange={change} />

      <div className="sticky bottom-0 mt-5 -mx-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span className="text-[12px] text-muted">{saved === "saving" ? "Saving…" : saved === "saved" ? "All changes saved" : saved === "error" ? <span className="text-red-700">Could not save, will try again</span> : ""}</span>
          <button className="btn-primary" disabled={submitting} onClick={submit}>{submitting && <Loader2 className="h-4 w-4 animate-spin" />} Send to {view.company.name || "us"}</button>
        </div>
        {submitError && <p className="mx-auto mt-2 max-w-2xl text-[13px] font-medium text-red-700">{submitError}</p>}
      </div>
    </Frame>
  );
}
