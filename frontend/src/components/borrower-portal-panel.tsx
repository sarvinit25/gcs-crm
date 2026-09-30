import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { ApplicationDetail } from "../lib/types";

/**
 * Gives staff what they need to hand a borrower portal access: the phone
 * number already on file plus a code, shared with the borrower by phone or
 * WhatsApp — there's no SMS/email automation wired up yet, so this is
 * deliberately a "read it out to them" flow, not a self-serve one.
 */
export function BorrowerPortalPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  // Same query key as the parent application-detail query — reads from the
  // shared cache rather than firing a second request.
  const query = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => api<ApplicationDetail>(`/applications/${applicationId}`),
  });

  const regenerate = useMutation({
    mutationFn: () =>
      api<{ portalAccessCode: string }>(`/applications/${applicationId}/portal-access-code`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    },
  });

  const app = query.data;
  if (!app) return null;

  const primaryPhone = app.applicants.find((a) => a.isPrimary)?.phone;

  const copyCode = () => {
    if (!app.portalAccessCode) return;
    void navigator.clipboard.writeText(app.portalAccessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">Borrower Portal Access</h2>
        <button
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending}
          className="btn-ghost"
          title="Issue a new code, invalidating the old one"
        >
          {regenerate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Regenerate
        </button>
      </div>

      <p className="text-[13px] text-muted">
        Share these with the applicant so they can track this file themselves at{" "}
        <span className="font-mono text-[12px]">/crm/track-login</span>.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Phone</p>
          <p className="mt-0.5 text-[13px] text-ink">{primaryPhone || "Not on file"}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Access code</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="font-mono text-[13px] tracking-widest text-ink">
              {app.portalAccessCode ?? "—"}
            </p>
            {app.portalAccessCode && (
              <button
                onClick={copyCode}
                className="rounded p-1 text-muted transition hover:bg-bg-light hover:text-navy"
                title="Copy code"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
