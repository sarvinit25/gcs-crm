import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { groupChecklist, withMark } from "../lib/checklist";
import type { ApplicationChecklist } from "../lib/types";

export function ChecklistPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const key = ["checklist", applicationId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<ApplicationChecklist>(`/applications/${applicationId}/checklist`),
  });

  // Ticking a line changes the screen at once; if the server refuses, the line goes back and the reason is shown.
  const mark = useMutation({
    mutationFn: ({ id, given }: { id: string; given: boolean }) =>
      api<ApplicationChecklist>(`/applications/${applicationId}/checklist/${id}`, { method: "PUT", body: JSON.stringify({ given }) }),
    onMutate: async ({ id, given }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<ApplicationChecklist>(key);
      if (before) queryClient.setQueryData(key, withMark(before, id, given));
      return { before };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.before) queryClient.setQueryData(key, ctx.before);
    },
    onSuccess: (list) => queryClient.setQueryData(key, list),
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
          No documents are listed for this loan type yet — add them under People → Document types.
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
            {groupChecklist(query.data.items).map(([category, items]) => (
              <div key={category}>
                <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
                  {category}
                </p>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const given = item.status === "GIVEN";
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={given}
                          onClick={() => mark.mutate({ id: item.id, given: !given })}
                          className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-[13px] transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600"
                        >
                          {given ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted/50" />
                          )}
                          <span>
                            <span className={clsx(given && "text-muted line-through")}>{item.label}</span>
                            {item.description && (
                              <span className="block text-[12px] text-muted">{item.description}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {mark.isError && <p className="mt-3 text-[12px] text-red-600">{(mark.error as Error).message}</p>}
        </>
      )}
    </section>
  );
}
