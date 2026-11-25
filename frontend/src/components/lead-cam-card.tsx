import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, ScanText } from "lucide-react";
import { api } from "../lib/api";

type Summary = { progress: number; familyLabel: string; link: { state: string | null } };

/** On the lead page: where the detailed CAM stands, the way into it, and filling it from the lead's documents. */
export function LeadCamCard({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["cam", leadId], queryFn: () => api<Summary>(`/leads/${leadId}/cam`), refetchOnWindowFocus: false });
  const read = useMutation({
    mutationFn: () => api<{ started: number }>(`/leads/${leadId}/read-documents`, { method: "POST" }),
    // Reading runs in the background, so the figure is checked again a few times as files finish.
    onSuccess: () => [15, 45, 90, 180].forEach((s) => setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["cam", leadId] }), s * 1000)),
  });
  const state = q.data?.link.state;
  const note = state === "submitted" ? "The customer has sent in their part" : state === "open" ? "Waiting for the customer to fill in their link" : state === "expired" ? "The customer's link has expired" : "";
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy"><FileSpreadsheet className="h-4 w-4" /> CAM (credit appraisal memo)</h2>
        <p className="mt-1 text-[13px] text-muted">
          {q.data ? `${q.data.familyLabel} · ${q.data.progress}% filled${note ? ` · ${note}` : ""}` : "Detailed information and the Excel CAM for this customer."}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">New uploads are read and fill the blank boxes by themselves. Check the figures before relying on them.</p>
        {read.data && <p className="mt-1 text-[12px] font-semibold text-emerald-700">Reading {read.data.started} document{read.data.started === 1 ? "" : "s"}. The CAM fills over the next few minutes.</p>}
        {read.isError && <p className="mt-1 text-[12px] font-semibold text-red-700">{(read.error as Error).message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={read.isPending} onClick={() => read.mutate()}>
          {read.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Read documents into CAM
        </button>
        <Link to="/leads/$leadId/cam" params={{ leadId }} className="btn-primary">Open CAM</Link>
      </div>
    </section>
  );
}
