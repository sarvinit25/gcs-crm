import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { ReviewModal } from "../routes/lender-offers";

type Row = { id: string; fileName: string | null; summary: string | null; status: string; createdAt: string; offerCount: number; sheetCount: number; hasFile: boolean };

/** The flyers, files and messages this lender's details were taken from. Open one to see the original beside what was read. */
export function LenderFlyers({ lenderId }: { lenderId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["lender-offers", { lenderId }], queryFn: () => api<Row[]>(`/lender-offers?lenderId=${lenderId}`) });
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-bold text-navy">Where this lender's details came from</h2>
        <p className="text-[12px] text-muted">The flyers, files and messages read for this lender. Click one to see the original next to what was taken from it.</p>
      </div>
      {q.isLoading ? (
        <div className="grid place-items-center py-8"><Loader2 className="h-4 w-4 animate-spin text-navy" /></div>
      ) : !q.data?.length ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nothing has been read for this lender yet. Details entered by hand have no flyer.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table clickable">
            <thead><tr><th>File or message</th><th>Read on</th><th>Products</th><th>One-pager details</th><th>Original</th></tr></thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(r.id))}>
                  <td className="min-w-48"><span className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted" /><span className="font-semibold text-navy">{r.fileName ?? "Pasted message"}</span></span>
                    <span className="line-clamp-1 pl-6 text-[11px] text-muted">{r.summary ?? ""}</span></td>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</td>
                  <td className="num">{r.offerCount || "—"}</td>
                  <td className="num">{r.sheetCount || "—"}</td>
                  <td className="whitespace-nowrap"><span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", r.hasFile ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{r.hasFile ? "Kept" : "Pasted text"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
