import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { DeleteConfirm } from "./delete-confirm";

type Preview = {
  leadNo: number;
  name: string;
  answers: number;
  followUps: number;
  files: number;
  application: { applicationNo: string; status: string; applicants: number; documents: number; sanction: boolean; disbursements: number; commissions: number } | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const words = (s: string) => s.replace(/_/g, " ").toLowerCase();

/**
 * The delete dialog for any lead. It first asks the server what the delete would take with it. A lead with a loan file takes the
 * file too (applicants, documents, sanction, disbursements and commissions), so that is spelled out and has to be ticked.
 */
export function LeadDeleteDialog({ lead, onDone, onClose }: { lead: { id: string; leadNo: number; name: string }; onDone: () => void; onClose: () => void }) {
  const preview = useQuery({ queryKey: ["lead-delete-preview", lead.id], queryFn: () => api<Preview>(`/leads/${lead.id}/delete-preview`) });
  const [ticked, setTicked] = useState(false);
  const p = preview.data;
  const app = p?.application ?? null;

  return (
    <DeleteConfirm
      title={`Delete lead #${lead.leadNo}?`}
      onDelete={async () => {
        if (!p) throw new Error("Still checking what is on this lead. Try again in a moment.");
        if (app && !ticked) throw new Error("Tick the box to confirm that the loan file is deleted with the lead.");
        return api(`/leads/${lead.id}${app ? "?withFile=true" : ""}`, { method: "DELETE" });
      }}
      onDone={onDone}
      onClose={onClose}
    >
      <p>
        <span className="font-semibold text-navy">
          #{lead.leadNo} {lead.name}
        </span>{" "}
        will be deleted for good{p ? `, with ${plural(p.followUps, "follow-up")}, ${plural(p.answers, "saved answer")} and ${plural(p.files, "uploaded file")}` : ""}.
      </p>
      {preview.isError && <p className="text-red-700">Could not check what is on this lead. You can still try.</p>}
      {app && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-red-900">
          <p className="font-semibold">
            This lead has a loan file, {app.applicationNo} ({words(app.status)}). It will be deleted too, with:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>{plural(app.applicants, "applicant")}</li>
            <li>{plural(app.documents, "document")} (the stored files are removed)</li>
            {app.sanction && <li>the sanction record</li>}
            <li>{plural(app.disbursements, "disbursement")}</li>
            <li>{plural(app.commissions, "commission record")}</li>
          </ul>
          <label className="flex items-start gap-2 pt-1 font-semibold">
            <input type="checkbox" className="mt-0.5" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
            I understand the loan file and its payment records are deleted too.
          </label>
        </div>
      )}
      <p className="text-muted">To keep everything and only move it out of the way, use Archive instead.</p>
    </DeleteConfirm>
  );
}
