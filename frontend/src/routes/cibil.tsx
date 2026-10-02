import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FlaskConical, History, Info, Loader2, Plus, Search, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/format";
import { todayIST } from "../lib/date";
import { BAND_STYLE, KIND_LABEL, missingForCheck, type CheckHistory, type CheckRecord, type CreditList, type CreditRow, type CreditStatus } from "../lib/credit";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { DatePicker } from "../components/date-picker";
import { TableSkeleton } from "../components/skeleton";

const useStatus = () => useQuery({ queryKey: ["credit-status"], queryFn: () => api<CreditStatus>("/credit/status"), staleTime: 60_000 });

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-xl font-bold text-navy">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

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

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["credit-list"] });
  void queryClient.invalidateQueries({ queryKey: ["credit-history"] });
  void queryClient.invalidateQueries({ queryKey: ["application"] });
}

function RecordModal({ row, onClose }: { row: CreditRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<CheckRecord>(`/credit/applicants/${row.id}/record`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => invalidateAll(queryClient),
  });
  const saved = save.data;
  return (
    <Modal title="Record a CIBIL score" subtitle={`${row.name} · ${row.application.applicationNo}`} onClose={onClose}>
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
            const text = (k: string) => ((f.get(k) as string) ?? "").trim();
            save.mutate({ score: Number(text("score")), reportDate: text("reportDate"), reference: text("reference") || undefined, note: text("note") || undefined });
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
            Where it came from (optional)
            <input name="note" maxLength={300} placeholder="e.g. HDFC login, customer's own report" className="field mt-1 font-normal" />
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

function RunModal({ row, status, onClose }: { row: CreditRow; status: CreditStatus; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [method, setMethod] = useState("");
  const missing = missingForCheck(row);
  const run = useMutation({
    mutationFn: (force: boolean) =>
      api<CheckRecord>(`/credit/applicants/${row.id}/check`, { method: "POST", body: JSON.stringify({ consent: true, consentMethod: method, ...(force && { force: true }) }) }),
    onSuccess: () => invalidateAll(queryClient),
  });
  const result = run.data;
  const repeatBlocked = run.isError && /not repeated within/.test((run.error as Error).message);

  return (
    <Modal title="Run a CIBIL check" subtitle={`${row.name} · ${row.application.applicationNo}`} onClose={onClose} maxWidth="max-w-lg">
      {result ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-line p-4 text-center">
            <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{KIND_LABEL[result.kind]}</p>
            <p className="mt-1 text-3xl font-bold text-navy">{result.score ?? "—"}</p>
            <div className="mt-1 flex justify-center">{result.band && <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", BAND_STYLE[result.band].chip)}>{BAND_STYLE[result.band].label}</span>}</div>
            {result.reference && <p className="mt-2 font-mono text-[12px] text-muted">{result.reference}</p>}
          </div>
          {result.kind === "SIMULATED" && (
            <p className="flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-[13px] text-sky-800">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" /> This is a simulated result for testing — it is not this person's real score and has not changed their file.
            </p>
          )}
          {result.applied && <p className="text-[13px] text-emerald-700">The applicant's file now shows this score.</p>}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {status.simulated && (
            <p className="flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-[13px] text-sky-800">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" /> Test mode: the result will be simulated and will not change anyone's score.
            </p>
          )}
          <dl className="grid grid-cols-3 gap-3 text-[13px]">
            {[["PAN", row.hasPan], ["Date of birth", row.hasDob], ["Mobile", Boolean(row.phone)]].map(([label, ok]) => (
              <div key={String(label)} className="rounded-md bg-bg-light px-3 py-2">
                <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</dt>
                <dd className={clsx("mt-0.5 font-semibold", ok ? "text-emerald-700" : "text-red-600")}>{ok ? "On file" : "Missing"}</dd>
              </div>
            ))}
          </dl>
          {missing.length > 0 ? (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Add the {missing.join(" and ")} on the application first.{" "}
                <Link to="/applications/$applicationId" params={{ applicationId: row.application.id }} className="font-semibold underline">Open the application</Link>
              </span>
            </p>
          ) : (
            <>
              <div>
                <p className="text-[12px] font-semibold text-muted">What the applicant agrees to</p>
                <p className="mt-1 rounded-md bg-bg-light px-3 py-2.5 text-[13px] text-ink">{status.consentText}</p>
              </div>
              <label className="block text-[12px] font-semibold text-muted">
                How did they give consent?
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="field mt-1 font-normal">
                  <option value="">Choose…</option>
                  {status.consentMethods.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2.5 text-[13px] text-ink">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>{row.name.split(" ")[0]} has agreed to this, and I have it on record.</span>
              </label>
            </>
          )}
          {run.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{(run.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            {repeatBlocked && user?.role === "ADMIN" && (
              <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate(true)}>Run it again anyway</button>
            )}
            <button className="btn-primary" disabled={missing.length > 0 || !agreed || !method || run.isPending} onClick={() => run.mutate(false)}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Run check
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function HistoryModal({ row, onClose }: { row: CreditRow; onClose: () => void }) {
  const query = useQuery({ queryKey: ["credit-history", row.id], queryFn: () => api<CheckHistory>(`/credit/applicants/${row.id}/checks`) });
  return (
    <Modal title="Score history" subtitle={`${row.name} · ${row.application.applicationNo}`} onClose={onClose} maxWidth="max-w-xl">
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
              {c.note && <p className="mt-0.5 text-[12px] text-muted">{c.note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-[13px] text-muted">No scores or checks recorded for this person yet.</p>
      )}
    </Modal>
  );
}

export function CibilPage() {
  const { q = "" } = useSearch({ strict: false }) as { q?: string };
  const navigate = useNavigate();
  const status = useStatus();
  const [search, setSearch] = useState(q);
  const [band, setBand] = useState("");
  const [show, setShow] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ kind: "run" | "record" | "history"; row: CreditRow } | null>(null);

  const query = useQuery({
    queryKey: ["credit-list", { search, band, show, page }],
    queryFn: () => api<CreditList>(`/credit/applicants${qs({ search, band, show, page })}`),
    placeholderData: (prev) => prev,
  });
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const s = query.data?.summary;
  const st = status.data;

  return (
    <>
      <PageHeader title="CIBIL" subtitle="Credit scores for every applicant, and credit checks made with their consent" />
      <div className="space-y-4 px-6 py-5">
        {st && !st.available && (
          <p className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Live bureau checks aren't connected yet.</strong> Once the firm's credit-bureau account is set up, a check can be run from here with one click. Until then you can record the score from any CIBIL report you already have — it is saved with its date and shown on the applicant's file.
            </span>
          </p>
        )}
        {st?.simulated && (
          <p className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>Test mode.</strong> Checks run from here are simulated. They are marked as such and never change an applicant's score.</span>
          </p>
        )}

        {s && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Applicants" value={String(s.applicants)} />
            <Tile label="With a score" value={String(s.scored)} hint={s.withoutScore ? `${s.withoutScore} still without` : "everyone covered"} />
            <Tile label="Average score" value={s.averageScore === null ? "—" : String(s.averageScore)} />
            <Tile label="Below 650" value={String(s.low)} hint="usually hard to place" />
            <Tile label="Checks this month" value={String(s.checksThisMonth)} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => reset(() => setSearch(e.target.value))}
              placeholder="Name, phone or application no."
              className="field w-64 pl-9"
            />
          </div>
          <select value={band} onChange={(e) => reset(() => setBand(e.target.value))} className="field w-48" aria-label="Score band">
            <option value="">All scores</option>
            {(st?.bands ?? []).map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
          <select value={show} onChange={(e) => reset(() => setShow(e.target.value))} className="field w-48" aria-label="Show">
            <option value="">Everyone</option>
            <option value="none">No score yet</option>
            <option value="stale">Score is out of date</option>
          </select>
          {q && (
            <button className="btn-ghost" onClick={() => void navigate({ to: "/cibil", search: { q: "" } as never }).then(() => reset(() => setSearch("")))}>
              Clear filter
            </button>
          )}
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.data?.items.length ? (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  {["Applicant", "Application", "Score", "Report date", "Source", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((r) => (
                  <tr key={r.id} className="border-b border-line/70 align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{r.name}{!r.isPrimary && <span className="ml-1.5 text-[11px] font-normal text-muted">co-applicant</span>}</p>
                      <p className="text-[12px] text-muted">{r.phone ?? "No phone"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/applications/$applicationId" params={{ applicationId: r.application.id }} className="font-semibold text-navy underline-offset-2 hover:underline">
                        {r.application.applicationNo}
                      </Link>
                      <p className="text-[12px] text-muted">{r.application.product}{r.application.owner ? ` · ${r.application.owner}` : ""}</p>
                    </td>
                    <td className="px-4 py-3"><ScoreChip score={r.score} band={r.band} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.scoreDate ? formatDate(r.scoreDate) : <span className="text-muted">{r.score !== null ? "date unknown" : "—"}</span>}
                      {r.stale && <p className="text-[11px] font-semibold text-amber-700">out of date</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.source ? KIND_LABEL[r.source] : r.score !== null ? "Entered on the file" : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {st?.available && (
                          <button className="btn-ghost" onClick={() => setDialog({ kind: "run", row: r })}>
                            <ShieldCheck className="h-4 w-4" /> Check
                          </button>
                        )}
                        <button className="btn-ghost" onClick={() => setDialog({ kind: "record", row: r })}>
                          <Plus className="h-4 w-4" /> Record score
                        </button>
                        <button className="btn-ghost" onClick={() => setDialog({ kind: "history", row: r })} aria-label={`History for ${r.name}`}>
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-16 text-center text-sm text-muted">No applicants match these filters.</p>
          )}
        </div>

        {query.data && query.data.total > query.data.pageSize && (
          <div className="flex items-center justify-between text-[13px] text-muted">
            <span>Page {query.data.page} of {Math.ceil(query.data.total / query.data.pageSize)}</span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button className="btn-ghost" disabled={page >= Math.ceil(query.data.total / query.data.pageSize)} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {dialog?.kind === "record" && <RecordModal row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "run" && st && <RunModal row={dialog.row} status={st} onClose={() => setDialog(null)} />}
      {dialog?.kind === "history" && <HistoryModal row={dialog.row} onClose={() => setDialog(null)} />}
    </>
  );
}
