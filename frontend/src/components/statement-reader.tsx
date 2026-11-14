import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileUp, Loader2, X } from "lucide-react";
import clsx from "clsx";
import { tokenStore } from "../lib/api";

// Staff upload a customer's bank statement; it is read on our server (nothing is stored or sent elsewhere), the figures
// are shown for checking, and one click puts them into the CAM's two bank tables.

type Month = { key: string; label: string; creditCount: number; debitCount: number; credits: number; debits: number; salary: number; emisSeen: number; avgBalance: number | null; minBalance: number | null; bal5: number | null; bal10: number | null; bal15: number | null; bal25: number | null; inward: number; outward: number; partial: boolean };
type Result = {
  kind: string;
  analysis: {
    transactions: number; from: string; to: string; monthsFound: number; months: Month[];
    openingBalance: number | null; closingBalance: number | null;
    emis: { label: string; amount: number; times: number; total: number }[];
    salary: { times: number; total: number; averagePerMonth: number | null };
    returns: { inward: number; outward: number; lines: string[] };
    warnings: string[];
  };
  fill: { bankingDetail: { detail: Record<string, unknown>[] }; banking: { months: Record<string, unknown>[] } };
};

const rs = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);

export function StatementReader({ leadId, onApply }: { leadId: string; onApply: (fill: Result["fill"]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [applied, setApplied] = useState(false);

  const read = useMutation({
    mutationFn: async (f: File) => {
      const body = new FormData();
      body.append("file", f);
      // a plain fetch: api() always sends JSON, and a file needs the browser's own multipart header
      const res = await fetch(`/crm/api/leads/${leadId}/cam/statement`, { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get()}` }, body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(Array.isArray(json?.message) ? json.message.join(", ") : (json?.message ?? "Could not read that statement"));
      return json as Result;
    },
    onSuccess: (r) => { setResult(r); setApplied(false); },
  });

  const reset = () => { setFile(null); setResult(null); setApplied(false); read.reset(); if (input.current) input.current.value = ""; };
  const a = result?.analysis;

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-bold text-navy">Read a bank statement</h2>
        <p className="text-[12px] text-muted">Upload the customer's statement (PDF with text, Excel or CSV). It is read here and never saved or sent anywhere else. Check the figures, then put them into the CAM.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".pdf,.xlsx,.csv,.txt,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="field min-w-0 max-w-xs flex-1 text-[12px]"
          aria-label="Bank statement file"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); read.reset(); }}
        />
        <button className="btn-primary" disabled={!file || read.isPending} onClick={() => file && read.mutate(file)}>
          {read.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Read it
        </button>
        {(file || result) && <button className="btn-ghost" onClick={reset}><X className="h-4 w-4" /> Clear</button>}
      </div>
      {read.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800">{(read.error as Error).message}</p>}

      {result && a && (
        <div className="space-y-3">
          <p className="text-[13px] text-ink">
            Read <strong>{a.transactions}</strong> entries from {a.from} to {a.to} ({result.kind}): <strong>{a.monthsFound}</strong> month{a.monthsFound === 1 ? "" : "s"}.
            {a.openingBalance !== null && <> Opening balance {rs(a.openingBalance)}, closing {rs(a.closingBalance)}.</>}
          </p>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="data-table">
              <thead>
                <tr><th>Month</th><th className="num">Credits</th><th className="num">Debits</th><th className="num">Salary</th><th className="num">EMIs seen</th><th className="num">Balance 5th</th><th className="num">10th</th><th className="num">15th</th><th className="num">25th</th><th className="num">Average</th><th className="num">Lowest</th><th className="num">Returns</th></tr>
              </thead>
              <tbody>
                {a.months.map((m) => (
                  <tr key={m.key} className={m.partial ? "!bg-amber-50" : undefined}>
                    <td className="font-semibold whitespace-nowrap text-navy">{m.label}{m.partial ? " (part)" : ""}</td>
                    <td className="num">{rs(m.credits)} <span className="text-[11px] text-muted">({m.creditCount})</span></td>
                    <td className="num">{rs(m.debits)} <span className="text-[11px] text-muted">({m.debitCount})</span></td>
                    <td className="num">{m.salary ? rs(m.salary) : "—"}</td>
                    <td className="num">{m.emisSeen ? rs(m.emisSeen) : "—"}</td>
                    <td className="num">{rs(m.bal5)}</td><td className="num">{rs(m.bal10)}</td><td className="num">{rs(m.bal15)}</td><td className="num">{rs(m.bal25)}</td>
                    <td className="num font-semibold">{rs(m.avgBalance)}</td>
                    <td className="num">{rs(m.minBalance)}</td>
                    <td className={clsx("num", m.inward + m.outward > 0 && "font-semibold text-red-700")}>{m.inward + m.outward || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-[12px] font-bold tracking-wide text-muted uppercase">EMIs and loan payments found</h3>
              {a.emis.length ? (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="data-table">
                    <thead><tr><th>Entry</th><th className="num">Usual amount</th><th className="num">Times</th></tr></thead>
                    <tbody>{a.emis.map((e, i) => <tr key={i}><td className="wrap">{e.label}</td><td className="num">{rs(e.amount)}</td><td className="num">{e.times}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="text-[13px] text-muted">None recognised.</p>}
            </div>
            <div className="space-y-2 text-[13px]">
              <div>
                <h3 className="mb-1 text-[12px] font-bold tracking-wide text-muted uppercase">Salary</h3>
                {a.salary.times ? <p>{a.salary.times} salary-type credit{a.salary.times === 1 ? "" : "s"}, {rs(a.salary.total)} in all, about {rs(a.salary.averagePerMonth)} a month.</p> : <p className="text-muted">No salary-type credits recognised.</p>}
              </div>
              <div>
                <h3 className="mb-1 text-[12px] font-bold tracking-wide text-muted uppercase">Returned payments</h3>
                {a.returns.inward + a.returns.outward ? (
                  <>
                    <p>{a.returns.inward} of the customer's own payments came back, {a.returns.outward} deposited cheque{a.returns.outward === 1 ? "" : "s"} came back.</p>
                    <ul className="mt-1 list-disc pl-5 text-[12px] text-muted">{a.returns.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </>
                ) : <p className="text-muted">None recognised.</p>}
              </div>
            </div>
          </div>

          <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={applied} onClick={() => { onApply(result.fill); setApplied(true); }}>
              {applied ? "Put into the CAM" : "Put these figures into the CAM"}
            </button>
            {applied && <span className="text-[13px] text-emerald-700">Done. The two bank tables below now have these months. Review them, then Save.</span>}
            {!applied && <span className="text-[12px] text-muted">This replaces the month-by-month rows in "Bank accounts and statements" and "Bank statement analysis, in detail".</span>}
          </div>
        </div>
      )}
    </section>
  );
}
