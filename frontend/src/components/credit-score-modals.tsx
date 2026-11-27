import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";
import { todayIST } from "../lib/date";
import { BAND_STYLE, KIND_LABEL, type CheckHistory, type CheckRecord, type CreditRow } from "../lib/credit";
import { Modal } from "./modal";
import { DatePicker } from "./date-picker";
import { TableSkeleton } from "./skeleton";

/** Whose score is being recorded or looked at. */
export type ScorePerson = { id: string; name: string; applicationNo: string };

export function ScoreChip({ score, band }: { score: number | null; band: CreditRow["band"] }) {
  if (score === null) return <span className="text-muted">No score yet</span>;
  const style = band ? BAND_STYLE[band] : null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={clsx("text-base font-bold", style?.text ?? "text-navy")}>{score}</span>
      {style && <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", style.chip)}>{style.label}</span>}
    </span>
  );
}

export function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["credit-list"] });
  void queryClient.invalidateQueries({ queryKey: ["credit-history"] });
  void queryClient.invalidateQueries({ queryKey: ["application"] });
  void queryClient.invalidateQueries({ queryKey: ["credit-evaluation"] });
  void queryClient.invalidateQueries({ queryKey: ["documents"] });
}

export function RecordModal({ person, onClose }: { person: ScorePerson; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (body: FormData) => api<CheckRecord>(`/credit/applicants/${person.id}/record`, { method: "POST", body }),
    onSuccess: () => invalidateAll(queryClient),
  });
  const saved = save.data;
  return (
    <Modal title="Record a CIBIL score" subtitle={`${person.name} · ${person.applicationNo}`} onClose={onClose}>
      {saved ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Recorded
          </p>
          <p className="text-[13px] text-muted">
            {saved.applied ? "The applicant's file now shows this score." : "A newer score is already on the file, so this older report was kept in the history only."}
          </p>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            // Blank boxes and an unchosen file are left out.
            for (const [k, v] of [...f.entries()]) if (typeof v === "string" ? !v.trim() : !v.size) f.delete(k);
            save.mutate(f);
          }}
        >
          <label className="text-[12px] font-semibold text-muted">
            Score (300–900)
            <input name="score" required type="number" min={300} max={900} step={1} inputMode="numeric" className="field mt-1 font-normal" />
          </label>
          <label className="text-[12px] font-semibold text-muted">
            Date on the report
            <DatePicker name="reportDate" required defaultValue={todayIST()} max={todayIST()} clearable={false} className="mt-1" />
          </label>
          <label className="text-[12px] font-semibold text-muted sm:col-span-2">
            Report reference (optional)
            <input name="reference" maxLength={80} className="field mt-1 font-normal" />
          </label>
          <label className="text-[12px] font-semibold text-muted sm:col-span-2">
            Report file (optional)
            <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="field mt-1 font-normal" />
            <span className="mt-1 block font-normal">PDF or photo. It is also kept in the application's documents.</span>
          </label>
          <label className="text-[12px] font-semibold text-muted sm:col-span-2">
            Note (optional)
            <textarea name="note" rows={3} maxLength={1000} placeholder="e.g. customer's own report; one old card settled in 2022" className="field mt-1 font-normal" />
          </label>
          {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 sm:col-span-2">{(save.error as Error).message}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save score
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function HistoryModal({ person, onClose }: { person: ScorePerson; onClose: () => void }) {
  const query = useQuery({ queryKey: ["credit-history", person.id], queryFn: () => api<CheckHistory>(`/credit/applicants/${person.id}/checks`) });
  const open = useMutation({
    mutationFn: (documentId: string) => api<{ url: string }>(`/applications/${query.data!.applicant.applicationId}/documents/${documentId}/download`),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  return (
    <Modal title="Score history" subtitle={`${person.name} · ${person.applicationNo}`} onClose={onClose} maxWidth="max-w-xl">
      {query.isPending ? (
        <TableSkeleton />
      ) : query.data?.checks.length ? (
        <ul className="space-y-2.5">
          {query.data.checks.map((c) => (
            <li key={c.id} className="rounded-lg border border-line p-3 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  {c.status === "SUCCESS" ? <ScoreChip score={c.score} band={c.band} /> : <span className="font-semibold text-red-600">Check failed</span>}
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", c.kind === "SIMULATED" ? "bg-sky-50 text-sky-700" : "bg-bg-light text-muted")}>{KIND_LABEL[c.kind]}</span>
                </span>
                <span className="text-[12px] text-muted">{formatDateTime(c.createdAt)}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">
                {[c.reportDate && `Report dated ${formatDate(c.reportDate)}`, c.reference, c.requestedBy && `by ${c.requestedBy.name}`].filter(Boolean).join(" · ")}
              </p>
              {c.consentMethod && <p className="mt-0.5 text-[12px] text-muted">Consent: {c.consentMethod}{c.consentAt ? ` (${formatDateTime(c.consentAt)})` : ""}</p>}
              {c.note && <p className="mt-0.5 text-[12px] whitespace-pre-line text-muted">{c.note}</p>}
              {c.document && (
                <button type="button" className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-navy underline" onClick={() => open.mutate(c.document!.id)}>
                  <FileText className="h-3.5 w-3.5" /> {c.document.fileName}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-[13px] text-muted">No scores or checks recorded for this person yet.</p>
      )}
      {open.isError && <p className="mt-2 text-[13px] text-red-600">{(open.error as Error).message}</p>}
    </Modal>
  );
}
