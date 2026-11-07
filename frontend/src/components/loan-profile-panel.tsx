import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Loader2, SkipForward } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount } from "../lib/format";

type Next = { key: string; num: string; label: string; kind: string; options: string[] | null; question: string };
type Profile = {
  progress: { done: number; total: number; complete: boolean };
  next: Next | null;
  answers: { section: string; num: string; label: string; value: string }[];
  totalMonthlyEmi: number;
};
type Step = { accepted: boolean; reply: string };

/** The wording shown above the answer box: the question without the numbered option list, which becomes buttons. */
const headline = (q: string) => q.split("\n")[0]!;

/**
 * The Customer Loan Profile on a lead: the same interview the WhatsApp assistant runs, for staff and the AI
 * telecaller to fill in while on the phone. Each answer is read by the same rules as on WhatsApp, so only a valid
 * value is ever stored. Mandatory questions cannot be left blank; only the few marked optional can be skipped.
 */
export function LoanProfilePanel({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");
  const profile = useQuery({ queryKey: ["loan-profile", leadId], queryFn: () => api<Profile>(`/leads/${leadId}/loan-profile`) });

  const answer = useMutation({
    mutationFn: (value: string) => api<Step>(`/leads/${leadId}/loan-profile/answer`, { method: "POST", body: JSON.stringify({ reply: value, key: profile.data?.next?.key }) }),
    onSuccess: (res) => {
      // A reply that could not be read comes back with the reason and the same question; show the reason.
      setMessage(res.accepted ? "" : res.reply.split("\n\n")[0] ?? "");
      if (res.accepted) setReply("");
      void queryClient.invalidateQueries({ queryKey: ["loan-profile", leadId] });
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const p = profile.data;
  const next = p?.next;
  const pct = p && p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : 0;
  const sections = [...new Set(p?.answers.map((a) => a.section) ?? [])];
  const optional = next ? /Say \*skip\*/.test(next.question) : false;

  return (
    <section id="loan-profile" className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
          <ClipboardList className="h-4 w-4 text-gold-dark" /> Customer loan profile
        </h2>
        {p && (
          <span className="text-[12px] text-muted">
            {p.progress.done} answered{p.progress.complete ? " · complete" : ""}
          </span>
        )}
      </div>

      {profile.isPending ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : profile.isError || !p ? (
        <p className="mt-3 text-sm text-red-600">{(profile.error as Error | null)?.message ?? "Could not load the profile."}</p>
      ) : (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-light" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile progress">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${pct}%` }} />
          </div>

          {next ? (
            <form
              className="mt-4 rounded-lg border border-line bg-bg-light/50 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) answer.mutate(reply.trim());
              }}
            >
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Next question · {next.num} {next.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-navy">{headline(next.question)}</p>
              {(next.options?.length || next.kind === "yesno") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(next.options?.length ? next.options : ["Yes", "No"]).map((o) => (
                    <button key={o} type="button" disabled={answer.isPending} className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => answer.mutate(o)}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {!next.options?.length && next.kind !== "yesno" && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={next.kind === "money" ? "e.g. 50 lakh or 4,50,000" : "Type the customer's answer"}
                    aria-label={next.label}
                    className="field"
                    inputMode={next.kind === "money" || next.kind === "int" || next.kind === "percent" ? "decimal" : "text"}
                  />
                  <button className="btn-primary shrink-0" disabled={answer.isPending || !reply.trim()}>
                    {answer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </button>
                  {optional && (
                    <button type="button" className="btn-ghost shrink-0" disabled={answer.isPending} onClick={() => answer.mutate("skip")}>
                      <SkipForward className="h-4 w-4" /> Skip
                    </button>
                  )}
                </div>
              )}
              {next.kind === "multi" && <p className="mt-2 text-[12px] text-muted">Choose one or more, separated by commas.</p>}
              {message && (
                <p role="alert" className="mt-2 text-[12px] text-red-600">
                  {message}
                </p>
              )}
            </form>
          ) : (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Every question has been answered.
            </p>
          )}

          {p.totalMonthlyEmi > 0 && (
            <p className="mt-4 text-[13px] text-ink">
              Total monthly EMI / obligations: <span className="font-bold text-navy">{formatAmount(p.totalMonthlyEmi)}</span>
            </p>
          )}

          {sections.map((s) => (
            <div key={s} className="mt-4">
              <h3 className="text-[11px] font-bold tracking-wide text-muted uppercase">{s}</h3>
              <dl className="mt-1.5 divide-y divide-line/70 rounded-lg border border-line">
                {p.answers
                  .filter((a) => a.section === s)
                  .map((a) => (
                    <div key={`${a.num}-${a.label}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-[13px]">
                      <dt className="text-muted">
                        {a.num} · {a.label}
                      </dt>
                      <dd className="font-medium text-navy">{a.value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
          {p.answers.length === 0 && <p className="mt-3 text-[13px] text-muted">Nothing answered yet. Customers can also fill this in on WhatsApp by typing “apply”.</p>}
        </>
      )}
    </section>
  );
}
