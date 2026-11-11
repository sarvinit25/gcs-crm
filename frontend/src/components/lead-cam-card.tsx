import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { api } from "../lib/api";

type Summary = { progress: number; familyLabel: string; link: { state: string | null } };

/** On the lead page: where the detailed CAM stands, and the way into it. */
export function LeadCamCard({ leadId }: { leadId: string }) {
  const q = useQuery({ queryKey: ["cam", leadId], queryFn: () => api<Summary>(`/leads/${leadId}/cam`), refetchOnWindowFocus: false });
  const state = q.data?.link.state;
  const note = state === "submitted" ? "The customer has sent in their part" : state === "open" ? "Waiting for the customer to fill in their link" : state === "expired" ? "The customer's link has expired" : "";
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy"><FileSpreadsheet className="h-4 w-4" /> CAM (credit appraisal memo)</h2>
        <p className="mt-1 text-[13px] text-muted">
          {q.data ? `${q.data.familyLabel} · ${q.data.progress}% filled${note ? ` · ${note}` : ""}` : "Detailed information and the Excel CAM for this customer."}
        </p>
      </div>
      <Link to="/leads/$leadId/cam" params={{ leadId }} className="btn-primary">Open CAM</Link>
    </section>
  );
}
