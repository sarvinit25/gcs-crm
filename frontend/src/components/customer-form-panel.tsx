import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Copy, ExternalLink, Link2, Loader2, MessageCircle, RefreshCw, XCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formLink, whatsappLink } from "../lib/customer-form";
import { formatDate, formatDateTime } from "../lib/format";
import type { ApplicationDetail } from "../lib/types";

type FormStatus =
  | { sent: false; canSend: boolean }
  | {
      sent: true;
      canSend: boolean;
      state: "open" | "submitted" | "expired" | "closed" | "revoked";
      token: string | null;
      expiresAt: string;
      createdAt: string;
      createdBy: string | null;
      openedAt: string | null;
      lastSavedAt: string | null;
      submittedAt: string | null;
      documentsReceived: number;
    };

const STATE_LABEL = { open: "Waiting for the customer", submitted: "Submitted", expired: "Link expired", closed: "Link closed", revoked: "Link withdrawn" } as const;

function Step({ done, label, when }: { done: boolean; label: string; when?: string | null }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={clsx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white", done ? "bg-emerald-600" : "bg-line")}>
        {done && <Check className="h-3 w-3" />}
      </span>
      <div className="leading-tight">
        <p className={clsx("text-[13px] font-semibold", done ? "text-navy" : "text-muted")}>{label}</p>
        {when && <p className="text-[12px] text-muted">{formatDateTime(when)}</p>}
      </div>
    </li>
  );
}

/**
 * Sends the customer a link to fill in their own application and upload documents.
 * What they type is held as a draft and only lands on the file when they submit,
 * after which it waits here for staff to check and take forward.
 */
export function CustomerFormPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const key = ["customer-form", applicationId];

  const status = useQuery({ queryKey: key, queryFn: () => api<FormStatus>(`/applications/${applicationId}/customer-form`) });
  // Same cache entry as the page, so no extra request.
  const application = useQuery({ queryKey: ["application", applicationId], queryFn: () => api<ApplicationDetail>(`/applications/${applicationId}`) });
  const org = useQuery({ queryKey: ["org-name"], queryFn: () => api<Record<string, unknown>>("/public/settings"), staleTime: 60 * 60 * 1000 });

  const done = () => queryClient.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: () => api<FormStatus>(`/applications/${applicationId}/customer-form`, { method: "POST" }),
    onSuccess: () => void done(),
  });
  const revoke = useMutation({
    mutationFn: () => api<FormStatus>(`/applications/${applicationId}/customer-form`, { method: "DELETE" }),
    onSuccess: () => void done(),
  });

  const s = status.data;
  const primary = application.data?.applicants.find((a) => a.isPrimary);
  if (!s) return null;

  const url = s.sent && s.token ? formLink(window.location.origin, s.token) : null;
  const orgName = (org.data?.["org.name"] as string | undefined) ?? "Growth Capital Services";
  const message = url
    ? `Hello ${primary?.name?.split(" ")[0] ?? ""}, please fill in your ${application.data?.loanProduct?.name ?? "loan"} application with ${orgName} here: ${url} (valid till ${formatDate(s.sent ? s.expiresAt : null)}). Keep your PAN and ID/income documents handy.`
    : "";

  const copy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const error = (create.error ?? revoke.error) as Error | null;
  const live = s.sent && (s.state === "open" || s.state === "submitted");

  return (
    <section className={clsx("card p-5", s.sent && s.state === "submitted" && "ring-2 ring-emerald-500/40")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-navy">Customer application form</h2>
          <p className="mt-0.5 text-[13px] text-muted">Send a link so the customer fills in their own details and uploads their documents.</p>
        </div>
        {s.sent && (
          <span className={clsx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", s.state === "submitted" ? "bg-emerald-50 text-emerald-700" : s.state === "open" ? "bg-gold-pale text-gold-dark" : "bg-bg-light text-muted")}>
            {STATE_LABEL[s.state]}
          </span>
        )}
      </div>

      {!s.sent && (
        <button className="btn-primary" disabled={!s.canSend || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create link
        </button>
      )}
      {!s.sent && !s.canSend && <p className="mt-2 text-[12px] text-muted">The form can only be sent while the application is still a draft.</p>}

      {s.sent && s.state === "submitted" && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The customer sent this in on {formatDateTime(s.submittedAt)}. Their answers are already on this file and {s.documentsReceived} document{s.documentsReceived === 1 ? "" : "s"} came with it — check them below, then take the file forward.
          </span>
        </p>
      )}

      {s.sent && (
        <>
          <ul className="grid gap-3 sm:grid-cols-4">
            <Step done label={`Sent${s.createdBy ? ` by ${s.createdBy.split(" ")[0]}` : ""}`} when={s.createdAt} />
            <Step done={Boolean(s.openedAt)} label="Opened" when={s.openedAt} />
            <Step done={Boolean(s.lastSavedAt)} label="Filling in" when={s.lastSavedAt} />
            <Step done={Boolean(s.submittedAt)} label="Submitted" when={s.submittedAt} />
          </ul>

          {url && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-1.5 rounded-md border border-line bg-bg-light px-2.5 py-1.5">
                <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={url}>{url}</p>
                <button onClick={copy} className="rounded p-1 text-muted transition hover:bg-white hover:text-navy" title="Copy link">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="rounded p-1 text-muted transition hover:bg-white hover:text-navy" title="Open as the customer sees it">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              {s.state === "open" && (
                <div className="flex flex-wrap items-center gap-2">
                  <a className="btn-primary" href={whatsappLink(primary?.phone, message)} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                  </a>
                  <span className="text-[12px] text-muted">Valid till {formatDate(s.expiresAt)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {s.canSend && (
              <button
                className="btn-ghost"
                disabled={create.isPending}
                onClick={() => {
                  if (!live || window.confirm("Sending a new link stops the current one from working. Continue?")) create.mutate();
                }}
              >
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {s.state === "open" ? "Send a new link" : s.state === "submitted" ? "Send a fresh link to correct something" : "Create a new link"}
              </button>
            )}
            {s.state === "open" && (
              <button className="btn-ghost" disabled={revoke.isPending} onClick={() => window.confirm("Withdraw this link? The customer won't be able to open it any more.") && revoke.mutate()}>
                {revoke.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Withdraw link
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error.message}</p>}
    </section>
  );
}
