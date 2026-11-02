import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount } from "../lib/format";
import type { MoneyTrail } from "../lib/types";

/**
 * Every rupee on one file, in order: requested → sanctioned → disbursed → earned.
 * The earning side comes back empty for Staff, so the tile simply isn't drawn.
 */
export function MoneyTrailStrip({ applicationId }: { applicationId: string }) {
  const query = useQuery({
    queryKey: ["money-trail", applicationId],
    queryFn: () => api<MoneyTrail>(`/applications/${applicationId}/money-trail`),
  });

  const t = query.data;
  if (!t) return null;

  const tiles: { label: string; value: number; hint?: string; tone?: string }[] = [
    { label: "Requested", value: t.requested },
    { label: "Sanctioned", value: t.sanctioned, hint: t.sanctioned ? undefined : "Not sanctioned yet" },
    {
      label: "Disbursed",
      value: t.disbursed,
      hint: t.payouts
        ? `${t.payouts} payout${t.payouts === 1 ? "" : "s"} · ${formatAmount(t.netDisbursed)} net of deductions`
        : "Nothing released yet",
    },
  ];
  if (t.commission) {
    const c = t.commission;
    tiles.push({
      label: "Earned",
      value: c.total,
      hint: c.total
        ? `${formatAmount(c.received)} received · ${formatAmount(c.outstanding)} to come · ${formatAmount(c.retained)} kept after payouts`
        : "No commission recorded",
      tone: "text-gold-dark",
    });
  }

  return (
    <section className="card p-4">
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {tiles.map((tile, i) => (
          <div key={tile.label} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg bg-bg-light px-3 py-2.5">
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{tile.label}</p>
              <p className={clsx("mt-0.5 text-[17px] font-bold text-navy", tile.tone)}>
                {formatAmount(tile.value)}
              </p>
              {tile.hint && <p className="mt-0.5 text-[11px] leading-snug text-muted">{tile.hint}</p>}
            </div>
            {i < tiles.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted/60 sm:block" />}
          </div>
        ))}
      </div>
    </section>
  );
}
