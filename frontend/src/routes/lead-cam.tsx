import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, Download, FileSpreadsheet, Link2, Loader2, MessageCircle, Save, Trash2 } from "lucide-react";
import { api, tokenStore } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { CamForm } from "../components/cam-form";
import { CamInsights, type CamAnalysis } from "../components/cam-insights";
import { StatementReader } from "../components/statement-reader";
import type { CamData, CamSection } from "../lib/cam";

type LinkInfo = { state: "open" | "submitted" | "expired" | "revoked" | null; token: string | null; expiresAt: string | null; createdAt: string | null; openedAt: string | null; lastSavedAt: string | null; submittedAt: string | null };
type Cam = {
  lead: { id: string; leadNo: number; name: string; phone: string; productName: string | null };
  family: string;
  familyLabel: string;
  families: { value: string; label: string }[];
  sections: CamSection[];
  data: CamData;
  analysis: CamAnalysis;
  progress: number;
  missing: { section: string; label: string }[];
  link: LinkInfo;
  updatedAt: string;
  updatedByName: string | null;
};

const linkText = (s: LinkInfo["state"]) =>
  s === "submitted" ? "The customer has submitted the form" : s === "expired" ? "The link has expired" : s === "revoked" ? "The link was withdrawn" : s === "open" ? "Link is live" : "No link sent yet";

/** The staff CAM: fill it in, send the customer a link for their part, and download the Excel when it is ready. */
export function LeadCamPage() {
  const { leadId } = useParams({ strict: false }) as { leadId: string };
  const queryClient = useQueryClient();
  const key = ["cam", leadId];
  const q = useQuery({ queryKey: key, queryFn: () => api<Cam>(`/leads/${leadId}/cam`), refetchOnWindowFocus: false });
  const [draft, setDraft] = useState<CamData | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  // take the server's answers in once per load, never over what is being typed
  useEffect(() => {
    if (q.data && !dirty && loadedFor.current !== q.data.updatedAt) {
      loadedFor.current = q.data.updatedAt;
      setDraft(q.data.data);
      setFamily(q.data.family);
    }
  }, [q.data, dirty]);

  const take = (c: Cam) => {
    queryClient.setQueryData(key, c);
    loadedFor.current = c.updatedAt;
    setDraft(c.data);
    setFamily(c.family);
    setDirty(false);
  };
  const save = useMutation({
    mutationFn: (chosen?: string) => api<Cam>(`/leads/${leadId}/cam`, { method: "PUT", body: JSON.stringify({ family: chosen ?? family, data: draft }) }),
    onSuccess: take,
  });
  const makeLink = useMutation({
    mutationFn: async () => { if (dirty) await save.mutateAsync(undefined); return api<Cam>(`/leads/${leadId}/cam/link`, { method: "POST" }); },
    onSuccess: (c) => queryClient.setQueryData(key, { ...c, data: draft ?? c.data }),
  });
  const revoke = useMutation({
    mutationFn: () => api<Cam>(`/leads/${leadId}/cam/link`, { method: "DELETE" }),
    onSuccess: (c) => queryClient.setQueryData(key, { ...c, data: draft ?? c.data }),
  });
  const download = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync(undefined);
      const res = await fetch(`/crm/api/leads/${leadId}/cam/export`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.message ?? "Could not build the CAM"); }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "CAM.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
    onMutate: () => setDownloadError(null),
    onError: (e: Error) => setDownloadError(e.message),
  });

  if (q.isLoading || !draft || !family) return <div className="grid place-items-center py-24"><Loader2 className="h-5 w-5 animate-spin text-navy" /></div>;
  if (q.isError || !q.data) return <p className="p-6 text-sm text-red-700">{(q.error as Error)?.message ?? "Could not open the CAM"}</p>;
  const cam = q.data;
  const link = cam.link;
  const url = link.token ? `${window.location.origin}/crm/cam/${link.token}` : null;
  const firstName = cam.lead.name.split(/\s+/)[0];
  const wa = url ? `https://wa.me/91${cam.lead.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hello ${firstName}, please fill in these details for your loan with Growth Capital Services. It saves as you go: ${url}`)}` : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link to="/leads/$leadId" params={{ leadId }} className="inline-flex items-center gap-1 text-[13px] font-semibold text-navy hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Back to the lead</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-navy">CAM: {cam.lead.name}</h1>
            <p className="text-[13px] text-muted">Lead #{cam.lead.leadNo}{cam.lead.productName ? ` · ${cam.lead.productName}` : ""} · {cam.progress}% filled</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="text-[12px] font-semibold text-amber-700">Unsaved changes</span>}
            <button className="btn-ghost" disabled={save.isPending || !dirty} onClick={() => save.mutate(undefined)}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
            <button className="btn-primary" disabled={download.isPending} onClick={() => download.mutate()}>{download.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Download Excel CAM</button>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-light"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${cam.progress}%` }} /></div>
        {downloadError && <p className="mt-2 text-[13px] font-medium text-red-700">{downloadError}</p>}
        {save.isError && <p className="mt-2 text-[13px] font-medium text-red-700">{(save.error as Error).message}</p>}
      </div>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-navy">Customer's link</h2>
            <p className="text-[12px] text-muted">{linkText(link.state)}{link.submittedAt ? ` on ${formatDateTime(link.submittedAt)}` : link.lastSavedAt ? `. Last saved ${formatDateTime(link.lastSavedAt)}` : link.openedAt ? `. Opened ${formatDateTime(link.openedAt)}` : ""}</p>
          </div>
          <label className="text-[13px] font-semibold text-navy">Loan family
            <select className="field ml-2 inline-block !w-auto" value={family} onChange={(e) => { setFamily(e.target.value); save.mutate(e.target.value); }}>
              {cam.families.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        </div>
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly className="field min-w-0 flex-1 text-[12px]" value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Customer link" />
            <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(url).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</button>
            {wa && <a className="btn-ghost" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
            <button className="btn-ghost" disabled={makeLink.isPending} onClick={() => makeLink.mutate()}><Link2 className="h-4 w-4" /> New link</button>
            <button className="btn-ghost text-red-700" disabled={revoke.isPending} onClick={() => revoke.mutate()}><Trash2 className="h-4 w-4" /> Withdraw</button>
          </div>
        ) : (
          <button className="btn-primary" disabled={makeLink.isPending} onClick={() => makeLink.mutate()}>{makeLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create a link for the customer</button>
        )}
        {(makeLink.isError || revoke.isError) && <p className="text-[13px] font-medium text-red-700">{((makeLink.error ?? revoke.error) as Error).message}</p>}
        <p className="text-[12px] text-muted">The customer fills in their own details from the link and you fill in the rest here. Nothing from "Staff assessment" is ever shown to them.</p>
      </section>

      <StatementReader
        leadId={leadId}
        onApply={(fill) => {
          setDraft((d) => ({
            ...(d ?? {}),
            bankingDetail: { ...((d ?? {}).bankingDetail ?? {}), ...fill.bankingDetail },
            banking: { ...((d ?? {}).banking ?? {}), ...fill.banking },
          }));
          setDirty(true);
        }}
      />

      <CamInsights a={cam.analysis} />

      {cam.missing.length > 0 && (
        <details className="card px-4 py-3 text-[13px]">
          <summary className="cursor-pointer font-semibold text-navy">{cam.missing.length} key question{cam.missing.length === 1 ? "" : "s"} still unanswered</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">{cam.missing.map((m, i) => <li key={i}>{m.label} <span className="text-[11px]">({m.section})</span></li>)}</ul>
        </details>
      )}

      <CamForm sections={cam.sections} data={draft} onChange={(s, k, v) => { setDraft((d) => ({ ...(d ?? {}), [s]: { ...((d ?? {})[s] ?? {}), [k]: v } })); setDirty(true); }} />

      <div className="flex justify-end gap-2 pb-6">
        <button className="btn-ghost" disabled={save.isPending || !dirty} onClick={() => save.mutate(undefined)}><Save className="h-4 w-4" /> Save</button>
        <button className="btn-primary" disabled={download.isPending} onClick={() => download.mutate()}><Download className="h-4 w-4" /> Download Excel CAM</button>
      </div>
    </div>
  );
}
