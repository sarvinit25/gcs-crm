import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { LeadDetail } from "../lib/types";
import { SmartMatchPanel } from "./smart-match-panel";

/** Smart lender match on an application page, filled from the application's own details. */
export function ApplicationMatch({ applicationId, leadId }: { applicationId: string; leadId?: string | null }) {
  const lead = useQuery({ queryKey: ["lead", leadId], queryFn: () => api<LeadDetail>(`/leads/${leadId}`), enabled: Boolean(leadId) });
  if (!leadId) return <p className="card p-5 text-[13px] text-muted">Lender match needs the application to come from a lead.</p>;
  if (!lead.data) return null;
  return <div id="lender-match"><SmartMatchPanel lead={lead.data} applicationId={applicationId} /></div>;
}
