import { Printer } from "lucide-react";
import clsx from "clsx";
import { buildOnePager, printOnePager, type OnePagerData } from "../lib/one-pager";

/** The policy one-pager as a clean read-only page, in the same layout as the form sent to banks. */
export function PolicyOnePager({ lenderName, data, compact = false, showPrint = true }: { lenderName: string | null | undefined; data: OnePagerData; compact?: boolean; showPrint?: boolean }) {
  const m = buildOnePager(lenderName, data);
  return (
    <div className={clsx("bg-white", compact ? "text-[12px]" : "text-[13px]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-navy">{m.title}</h3>
          <p className="text-[12px] text-muted">{m.intro}</p>
        </div>
        {showPrint && (
          <button type="button" className="btn-ghost" onClick={() => printOnePager(m, lenderName ?? "Lender")}>
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-x-8 gap-y-1 lg:grid-cols-2">
        {m.sections.map((s) => (
          <section key={s.title} className="mb-3 break-inside-avoid">
            <h4 className="border-b-2 border-gold/70 pb-1 text-[11px] font-bold tracking-wider text-navy uppercase">{s.title}</h4>
            {s.lines.length > 0 && (
              <dl className="divide-y divide-line/60">
                {s.lines.map((x) => (
                  <div key={x.label} className="grid grid-cols-[1fr_1fr] gap-3 py-1.5">
                    <dt className="text-muted">{x.label}</dt>
                    <dd className={clsx(x.value ? "font-semibold text-navy" : "text-muted/70")}>{x.value ?? "Not given"}</dd>
                  </div>
                ))}
              </dl>
            )}
            {s.boxes && (
              <ul className="mt-1.5 grid grid-cols-1 gap-y-1 sm:grid-cols-2">
                {s.boxes.map((b) => (
                  <li key={b.label} className={clsx(b.on ? "font-semibold text-navy" : "text-muted")}>
                    <span aria-hidden="true">{b.on ? "☑" : "☐"}</span> {b.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <section className="mt-1">
        <h4 className="border-b-2 border-gold/70 pb-1 text-[11px] font-bold tracking-wider text-navy uppercase">Validity and other charges</h4>
        <dl className="divide-y divide-line/60">
          {m.footer.map((x) => (
            <div key={x.label} className="grid grid-cols-[1fr_1fr] gap-3 py-1.5 lg:grid-cols-[1fr_3fr]">
              <dt className="text-muted">{x.label}</dt>
              <dd className={clsx(x.value ? "font-semibold text-navy" : "text-muted/70")}>{x.value ?? "Not given"}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
