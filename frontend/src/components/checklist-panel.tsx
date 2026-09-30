import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import type { ApplicationChecklist } from "../lib/types";

/** Groups a flat checklist into category buckets, in first-seen order. */
function groupByCategory(items: ApplicationChecklist["items"]) {
  const groups = new Map<string, ApplicationChecklist["items"]>();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category)!.push(item);
  }
  return [...groups.entries()];
}

export function ChecklistPanel({ applicationId }: { applicationId: string }) {
  const query = useQuery({
    queryKey: ["checklist", applicationId],
    queryFn: () => api<ApplicationChecklist>(`/applications/${applicationId}/checklist`),
  });

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">Required Documents</h2>
        {query.data && (
          <span className="text-[12px] font-semibold text-muted">
            {query.data.given} / {query.data.total} received
          </span>
        )}
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : query.isError ? (
        <p className="text-[13px] text-red-600">{(query.error as Error).message}</p>
      ) : !query.data.items.length ? (
        <p className="text-[13px] text-muted">
          No checklist defined for this loan product yet — add items under Settings → Document
          checklist.
        </p>
      ) : (
        <>
          {!query.data.bucket && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Only the universal documents are shown below — set the primary applicant's
              employment type (and business constitution or NRI status, if relevant) to see the
              full checklist for their profile.
            </p>
          )}
          <div className="space-y-4">
            {groupByCategory(query.data.items).map(([category, items]) => (
              <div key={category}>
                <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
                  {category}
                </p>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-[13px]">
                      {item.status === "GIVEN" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted/50" />
                      )}
                      <span className={clsx(item.status === "GIVEN" && "text-muted line-through")}>
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
