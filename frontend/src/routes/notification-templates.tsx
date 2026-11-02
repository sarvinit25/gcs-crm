import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Loader2, MessageCircle, Pencil, Plus, RefreshCw, RotateCcw, Trash2, User, UserCog } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import {
  META_STATUS_LABEL,
  extractVariables,
  renderPreview,
  type MetaStatus,
  type NotificationTemplate,
  type Recipient,
  type TemplateMeta,
  type Trigger,
} from "../lib/whatsapp";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { Switch } from "../components/switch";
import { TableSkeleton } from "../components/skeleton";

const META_TONE: Record<MetaStatus, string> = {
  NOT_SUBMITTED: "bg-slate-100 text-slate-600",
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  PAUSED: "bg-orange-50 text-orange-700",
};

function RecipientTag({ recipient }: { recipient: Recipient }) {
  const Icon = recipient === "CUSTOMER" ? User : UserCog;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", recipient === "CUSTOMER" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700")}>
      <Icon className="h-3 w-3" /> {recipient === "CUSTOMER" ? "Customer" : "Employee"}
    </span>
  );
}

function Editor({
  meta,
  template,
  taken,
  onClose,
  onSaved,
}: {
  meta: TemplateMeta;
  template: NotificationTemplate | null;
  /** "TRIGGER/RECIPIENT" pairs that already have a template, so a duplicate can't be started. */
  taken: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [trigger, setTrigger] = useState<Trigger>(template?.trigger ?? "LEAD_CREATED");
  const [recipient, setRecipient] = useState<Recipient>(template?.recipient ?? "CUSTOMER");
  const [body, setBody] = useState(template?.body ?? "");
  const [active, setActive] = useState(template?.active ?? true);
  const area = useRef<HTMLTextAreaElement>(null);

  const info = meta.triggers.find((t) => t.value === trigger)!;
  const examples = Object.fromEntries(info.variables.map((v) => [v.key, v.example]));
  const used = extractVariables(body);
  const pairTaken = !template && taken.has(`${trigger}/${recipient}`);

  const save = useMutation({
    mutationFn: () =>
      template
        ? api(`/notifications/templates/${template.id}`, { method: "PATCH", body: JSON.stringify({ name, body, active }) })
        : api("/notifications/templates", { method: "POST", body: JSON.stringify({ name, trigger, recipient, body, active }) }),
    onSuccess: onSaved,
  });

  /** Drops a placeholder in where the cursor is. */
  const insert = (key: string) => {
    const el = area.current;
    const tag = `{{${key}}}`;
    if (!el) return setBody((b) => b + tag);
    const [from, to] = [el.selectionStart, el.selectionEnd];
    setBody(body.slice(0, from) + tag + body.slice(to));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from + tag.length, from + tag.length);
    });
  };

  const reworded = template && body.trim() !== template.body && template.metaStatus !== "NOT_SUBMITTED" && meta.provider.requiresApproval;

  return (
    <Modal title={template ? "Edit template" : "Add template"} subtitle="Sent automatically when the event happens" onClose={onClose} maxWidth="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-3"
      >
        {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(save.error as Error).message}</p>}

        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Name, e.g. Sanction approved (customer)" className="field" />

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
            When
            <select value={trigger} disabled={Boolean(template)} onChange={(e) => {
              const next = e.target.value as Trigger;
              setTrigger(next);
              const allowed = meta.triggers.find((t) => t.value === next)!.recipients;
              if (!allowed.includes(recipient)) setRecipient(allowed[0]);
            }} className="field mt-1 font-normal tracking-normal normal-case">
              {meta.triggers.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
            Sent to
            <select value={recipient} disabled={Boolean(template)} onChange={(e) => setRecipient(e.target.value as Recipient)} className="field mt-1 font-normal tracking-normal normal-case">
              {info.recipients.map((r) => (
                <option key={r} value={r}>
                  {r === "CUSTOMER" ? "The customer" : "The team member"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[12px] text-muted">{info.description}</p>
        {pairTaken && <p className="text-[12px] font-semibold text-amber-700">There's already a template for this — edit that one instead.</p>}

        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Message</span>
            <span className="text-[11px] text-muted">— click to insert:</span>
            {info.variables.map((v) => (
              <button type="button" key={v.key} onClick={() => insert(v.key)} title={`${v.label}, e.g. ${v.example}`} className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-semibold text-navy transition hover:border-gold hover:bg-gold-pale/40">
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
          <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value)} required rows={5} maxLength={1024} className="field" placeholder="Hello {{name}}, …" />
          <p className="mt-1 text-[11px] text-muted">
            {body.length}/1024 · Meta doesn't allow a message to start or end with a placeholder.
            {used.length > 0 && ` Uses ${used.length} placeholder${used.length === 1 ? "" : "s"}.`}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-bg-light/60 p-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Preview with sample values</p>
          <p className="text-[13px] whitespace-pre-wrap text-ink">{body ? renderPreview(body, examples) : "—"}</p>
        </div>

        {reworded && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            Changing the wording makes this a new template for Meta. It will go back to "Not submitted" and must be sent for review again before it can be used.
          </p>
        )}

        <label className="flex items-center gap-3 text-[13px] font-semibold text-navy">
          <Switch checked={active} onChange={setActive} label="Active" /> Active
        </label>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={save.isPending || pairTaken} className="btn-primary">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save template
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NotificationTemplatesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<NotificationTemplate | "new" | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const meta = useQuery({ queryKey: ["wa-template-meta"], queryFn: () => api<TemplateMeta>("/notifications/templates/meta") });
  const list = useQuery({ queryKey: ["wa-templates"], queryFn: () => api<NotificationTemplate[]>("/notifications/templates") });

  const reload = () => void queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
  const done = (text: string) => {
    setNote({ tone: "ok", text });
    reload();
  };
  const failed = (e: unknown) => setNote({ tone: "error", text: (e as Error).message });

  const toggle = useMutation({
    mutationFn: (t: NotificationTemplate) => api(`/notifications/templates/${t.id}`, { method: "PATCH", body: JSON.stringify({ active: !t.active }) }),
    onSuccess: reload,
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (t: NotificationTemplate) => api(`/notifications/templates/${t.id}`, { method: "DELETE" }),
    onSuccess: () => done("Template deleted."),
    onError: failed,
  });
  const submit = useMutation({
    mutationFn: (t: NotificationTemplate) => api<NotificationTemplate>(`/notifications/templates/${t.id}/submit`, { method: "POST" }),
    onSuccess: (t) => done(`Sent to Meta for review — ${META_STATUS_LABEL[t.metaStatus].toLowerCase()}. Meta usually answers within minutes to a day.`),
    onError: failed,
  });
  const refresh = useMutation({
    mutationFn: () => api<{ checked: number; updated: number }>("/notifications/templates/refresh", { method: "POST" }),
    onSuccess: (r) => done(r.updated ? `Updated ${r.updated} template${r.updated === 1 ? "" : "s"} from Meta.` : "Everything is already up to date."),
    onError: failed,
  });
  const reset = useMutation({
    mutationFn: () => api<{ created: number; restored: number }>("/notifications/templates/reset-defaults", { method: "POST" }),
    onSuccess: (r) => done(r.created || r.restored ? `Restored the standard wording: ${r.restored} reset, ${r.created} added.` : "Everything already matches the standard set."),
    onError: failed,
  });

  const taken = new Set((list.data ?? []).map((t) => `${t.trigger}/${t.recipient}`));
  const needsApproval = meta.data?.provider.requiresApproval ?? true;

  return (
    <>
      <PageHeader
        title="Notification templates"
        subtitle="Messages the CRM sends by itself — and where each stands with Meta"
        actions={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => refresh.mutate()} disabled={refresh.isPending} className="btn-ghost">
              <RefreshCw className={clsx("h-4 w-4", refresh.isPending && "animate-spin")} /> Refresh from Meta
            </button>
            <button
              onClick={() => window.confirm("Put the standard wording back on any template that has been changed, and add any that were deleted?") && reset.mutate()}
              disabled={reset.isPending}
              className="btn-ghost"
            >
              <RotateCcw className="h-4 w-4" /> Reset to defaults
            </button>
            <button onClick={() => setEditing("new")} className="btn-primary">
              <Plus className="h-4 w-4" /> Add template
            </button>
          </div>
        }
      />

      <div className="px-4 py-4 lg:px-6">
        {note && <p className={clsx("mb-3 rounded-md px-3 py-2 text-[13px]", note.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{note.text}</p>}
        {meta.data && !needsApproval && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Running in sandbox mode: templates are approved instantly and nothing reaches WhatsApp.</p>
        )}

        <div className="card overflow-x-auto">
          {list.isPending || meta.isPending ? (
            <TableSkeleton />
          ) : list.isError ? (
            <p className="py-16 text-center text-sm text-red-600">{(list.error as Error).message}</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Name</th>
                  <th className="px-4 py-2.5 font-bold">Channel</th>
                  <th className="px-4 py-2.5 font-bold">Trigger</th>
                  <th className="px-4 py-2.5 font-bold">Recipient</th>
                  <th className="px-4 py-2.5 font-bold">Active</th>
                  <th className="px-4 py-2.5 font-bold">Meta status</th>
                  <th className="px-4 py-2.5 font-bold">Created</th>
                  <th className="px-4 py-2.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((t) => (
                  <tr key={t.id} className="border-b border-line/70 align-top last:border-0 hover:bg-bg-light/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{t.name}</p>
                      <p className="text-[11px] text-muted">{t.code}</p>
                      <p className="mt-1 max-w-md text-[12px] text-muted">{t.body}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{meta.data!.triggers.find((x) => x.value === t.trigger)?.label}</td>
                    <td className="px-4 py-3">
                      <RecipientTag recipient={t.recipient} />
                    </td>
                    <td className="px-4 py-3">
                      <Switch checked={t.active} onChange={() => toggle.mutate(t)} label={`${t.name} active`} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap", META_TONE[t.metaStatus])}>{META_STATUS_LABEL[t.metaStatus]}</span>
                      {t.metaReason && <p className="mt-1 max-w-[12rem] text-[11px] text-red-600">{t.metaReason}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {needsApproval && (t.metaStatus === "NOT_SUBMITTED" || t.metaStatus === "REJECTED") && (
                          <button onClick={() => submit.mutate(t)} disabled={submit.isPending} title="Send to Meta for review" className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy">
                            <CloudUpload className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => setEditing(t)} title="Edit" className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => window.confirm(`Delete "${t.name}"?`) && remove.mutate(t)} title="Delete" className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && meta.data && (
        <Editor
          meta={meta.data}
          template={editing === "new" ? null : editing}
          taken={taken}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            done("Template saved.");
          }}
        />
      )}
    </>
  );
}
