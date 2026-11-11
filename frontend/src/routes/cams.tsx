import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Plus, Search } from "lucide-react";
import { api, qs, tokenStore } from "../lib/api";
import { formatDateTime } from "../lib/format";

type Row = {
  leadId: string; leadNo: number; name: string; phone: string; productName: string | null; familyLabel: string; progress: number;
  linkState: "open" | "submitted" | "expired" | "revoked" | null; submittedAt: string | null; updatedAt: string; updatedByName: string | null;
};
type LeadHit = { id: string; leadNo: number; name: string; phone: string };

const LINK: Record<string, { text: string; cls: string }> = {
  submitted: { text: "Customer submitted", cls: "bg-emerald-50 text-emerald-700" },
  open: { text: "Waiting for customer", cls: "bg-amber-50 text-amber-700" },
  expired: { text: "Link expired", cls: "bg-red-50 text-red-700" },
  revoked: { text: "Link withdrawn", cls: "bg-slate-100 text-slate-600" },
};

/** Downloads the Excel CAM for one lead. */
export async function downloadCam(leadId: string) {
  const res = await fetch(`/crm/api/leads/${leadId}/cam/export`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new Error(b?.message ?? "Could not build the CAM");
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "CAM.xlsx";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** All CAMs in one place: where each stands, the Excel for each, and a way to start one for any lead. */
export function CamsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [find, setFind] = useState("");
  const list = useQuery({ queryKey: ["cams", search], queryFn: () => api<Row[]>(`/cams${qs({ search: search || undefined })}`) });
  const hits = useQuery({
    queryKey: ["cam-find", find],
    queryFn: () => api<{ items: LeadHit[] }>(`/leads${qs({ search: find })}`),
    enabled: find.trim().length >= 2,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dl = useMutation({
    mutationFn: (id: string) => {
      setBusy(id);
      setError(null);
      return downloadCam(id);
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => setBusy(null),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-navy"><FileSpreadsheet className="h-5 w-5" /> CAM: credit appraisal memos</h1>
        <p className="text-[13px] text-muted">Every customer's detailed CAM in one list. Open one to fill it in or send the customer their link, or download the Excel.</p>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-navy">Start a CAM for a lead</h2>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="field !pl-9" placeholder="Type a name or mobile number" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a lead" />
        </div>
        {find.trim().length >= 2 && (
          <ul className="max-w-md divide-y divide-line rounded-lg border border-line text-[13px]">
            {hits.isLoading && <li className="px-3 py-2 text-muted">Searching…</li>}
            {hits.data?.items.slice(0, 6).map((l) => (
              <li key={l.id}>
                <button className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-bg-light" onClick={() => navigate({ to: "/leads/$leadId/cam", params: { leadId: l.id } })}>
                  <span><span className="font-semibold text-navy">{l.name}</span> <span className="text-muted">#{l.leadNo} · {l.phone}</span></span>
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy"><Plus className="h-3.5 w-3.5" /> Start</span>
                </button>
              </li>
            ))}
            {hits.data && hits.data.items.length === 0 && <li className="px-3 py-2 text-muted">No lead found.</li>}
          </ul>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-3 p-4 pb-2">
          <h2 className="text-sm font-bold text-navy">CAMs started{list.data ? ` (${list.data.length})` : ""}</h2>
          <input className="field max-w-60 !py-1.5 text-[13px]" placeholder="Filter by name or mobile" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter the list" />
        </div>
        {error && <p className="px-4 pb-2 text-[13px] font-medium text-red-700">{error}</p>}
        {list.isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-navy" /></div>
        ) : !list.data?.length ? (
          <p className="px-4 pb-6 text-[13px] text-muted">No CAM started yet. Find a lead above, or open a lead and use its CAM card.</p>
        ) : (
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
                <th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Loan</th><th className="px-4 py-2.5">Filled</th><th className="px-4 py-2.5">Customer's link</th><th className="px-4 py-2.5">Last updated</th><th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.leadId} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <Link to="/leads/$leadId/cam" params={{ leadId: r.leadId }} className="font-semibold text-navy hover:underline">{r.name}</Link>
                    <div className="text-[12px] text-muted">#{r.leadNo} · {r.phone}</div>
                  </td>
                  <td className="px-4 py-2.5">{r.productName ?? r.familyLabel}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-light"><div className="h-full rounded-full bg-gold" style={{ width: `${r.progress}%` }} /></div>
                      <span className="text-[12px] text-muted">{r.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.linkState ? <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${LINK[r.linkState]!.cls}`}>{LINK[r.linkState]!.text}</span> : <span className="text-muted">No link sent</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{formatDateTime(r.updatedAt)}{r.updatedByName ? <div className="text-[12px]">{r.updatedByName}</div> : null}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link to="/leads/$leadId/cam" params={{ leadId: r.leadId }} className="rounded px-2 py-1.5 text-[12px] font-semibold text-navy hover:bg-bg-light">Open</Link>
                    <button className="btn-ghost" disabled={busy === r.leadId} onClick={() => dl.mutate(r.leadId)}>
                      {busy === r.leadId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
