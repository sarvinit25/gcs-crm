import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, CheckCheck, Clock, FileText, Hand, Loader2, MessageSquarePlus, Search, Send } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { formatTimeIST } from "../lib/date";
import {
  SENDER_LABEL,
  extractVariables,
  formatPhone,
  renderPreview,
  windowLeft,
  type Conversation,
  type ConversationList,
  type NotificationTemplate,
  type WhatsAppMessage,
} from "../lib/whatsapp";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { TableSkeleton } from "../components/skeleton";

type Thread = { conversation: Conversation; messages: WhatsAppMessage[] };

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? formatTimeIST(d) : formatDateTime(iso).split(",")[0];
};

/** Values the server fills in itself; the person only supplies the rest. */
const SERVER_FILLED = ["company", "name"];

function Tick({ status }: { status: WhatsAppMessage["status"] }) {
  if (status === "READ") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />;
  if (status === "DELIVERED") return <CheckCheck className="h-3.5 w-3.5 text-muted" aria-label="Delivered" />;
  if (status === "SENT") return <Check className="h-3.5 w-3.5 text-muted" aria-label="Sent" />;
  if (status === "FAILED") return <span className="text-[10px] font-bold text-red-600">Failed</span>;
  return null;
}

function Bubble({ m }: { m: WhatsAppMessage }) {
  const mine = m.direction === "OUT";
  const automatic = m.sender === "BOT" || m.sender === "SYSTEM";
  const text = m.body ?? (m.type === "text" ? "" : `Sent a ${m.type}. Open WhatsApp on the phone to view it.`);
  return (
    <div className={clsx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[82%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
          !mine && "border border-line bg-white text-ink",
          mine && !automatic && "bg-navy text-white",
          mine && automatic && "border border-gold/30 bg-gold-pale/50 text-ink",
        )}
      >
        {mine && (
          <p className={clsx("mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase", automatic ? "text-gold-dark" : "text-white/60")}>
            {automatic && <Bot className="h-3 w-3" />} {SENDER_LABEL[m.sender]}
            {m.type === "template" && " · template"}
          </p>
        )}
        <p className={clsx("whitespace-pre-wrap", !m.body && "italic opacity-80")}>
          {!m.body && !mine && m.type !== "text" && <FileText className="mr-1 inline h-3.5 w-3.5" />}
          {text}
        </p>
        <p className={clsx("mt-1 flex items-center justify-end gap-1 text-[10px]", mine && !automatic ? "text-white/55" : "text-muted")}>
          {timeOf(m.createdAt)} {mine && <Tick status={m.status} />}
        </p>
        {m.error && <p className="mt-0.5 text-[11px] text-red-500">{m.error}</p>}
      </div>
    </div>
  );
}

/** Pick an approved customer template and fill in what it needs — the only way to write first or after 24 hours. */
function TemplatePicker({
  templates,
  conversationName,
  onSend,
  pending,
  error,
}: {
  templates: NotificationTemplate[];
  conversationName: string | null;
  onSend: (templateId: string, variables: Record<string, string>) => void;
  pending: boolean;
  error?: string;
}) {
  const usable = templates.filter((t) => t.recipient === "CUSTOMER" && t.active);
  const [id, setId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const chosen = usable.find((t) => t.id === id);
  const asked = chosen ? extractVariables(chosen.body).filter((k) => !SERVER_FILLED.includes(k) || (k === "name" && !conversationName)) : [];

  return (
    <div className="space-y-2">
      <select value={id} onChange={(e) => { setId(e.target.value); setValues({}); }} className="field">
        <option value="">Choose a message template…</option>
        {usable.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.metaStatus !== "APPROVED" ? ` (${t.metaStatus.toLowerCase().replace("_", " ")})` : ""}
          </option>
        ))}
      </select>
      {chosen && (
        <>
          {asked.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {asked.map((k) => (
                <input key={k} value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} placeholder={k} className="field" />
              ))}
            </div>
          )}
          <p className="rounded-lg bg-bg-light px-3 py-2 text-[12px] whitespace-pre-wrap text-muted">
            {renderPreview(chosen.body, { name: conversationName ?? "", ...values })}
          </p>
        </>
      )}
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <button disabled={!chosen || pending} onClick={() => chosen && onSend(chosen.id, values)} className="btn-primary">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send template
      </button>
    </div>
  );
}

function NewChat({ templates, onClose, onStarted }: { templates: NotificationTemplate[]; onClose: () => void; onStarted: (id: string) => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const start = useMutation({
    mutationFn: (body: { templateId: string; variables: Record<string, string> }) =>
      api<{ conversationId: string }>("/whatsapp/conversations", { method: "POST", body: JSON.stringify({ phone, name: name || undefined, ...body }) }),
    onSuccess: (r) => onStarted(r.conversationId),
  });
  return (
    <Modal title="New chat" subtitle="WhatsApp only lets you start a conversation with an approved template" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" className="field" inputMode="tel" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="field" />
        </div>
        <TemplatePicker
          templates={templates}
          conversationName={name || null}
          pending={start.isPending}
          error={start.isError ? (start.error as Error).message : undefined}
          onSend={(templateId, variables) => start.mutate({ templateId, variables: { ...variables, ...(name && { name }) } })}
        />
      </div>
    </Modal>
  );
}

export function WhatsAppInboxPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newChat, setNewChat] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const list = useQuery({
    queryKey: ["wa-conversations", { search, needsOnly }],
    queryFn: () => api<ConversationList>(`/whatsapp/conversations${qs({ search, needsHuman: needsOnly ? "true" : undefined })}`),
    refetchInterval: 10_000,
  });

  const thread = useQuery({
    queryKey: ["wa-thread", selected],
    queryFn: () => api<Thread>(`/whatsapp/conversations/${selected}`),
    enabled: Boolean(selected),
    refetchInterval: 8_000,
  });

  const templates = useQuery({
    queryKey: ["wa-templates-for-inbox"],
    queryFn: () => api<NotificationTemplate[]>("/whatsapp/conversations/templates"),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["wa-thread", selected] });
    void queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["wa-unread"] });
  };

  const send = useMutation({
    mutationFn: (body: { text?: string; templateId?: string; variables?: Record<string, string> }) =>
      api(`/whatsapp/conversations/${selected}/messages`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setDraft("");
      refresh();
    },
  });

  const flag = useMutation({
    mutationFn: (needsHuman: boolean) => api(`/whatsapp/conversations/${selected}`, { method: "PATCH", body: JSON.stringify({ needsHuman }) }),
    onSuccess: refresh,
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread.data?.messages.length, selected]);

  // Opening a thread marks it read, so the badge in the menu should follow.
  useEffect(() => {
    if (thread.data) void queryClient.invalidateQueries({ queryKey: ["wa-unread"] });
  }, [thread.dataUpdatedAt, queryClient, thread.data]);

  const c = thread.data?.conversation;
  const left = useMemo(() => (c ? windowLeft(c.lastInboundAt) : null), [c]);
  const approvedTemplates = templates.data ?? [];

  return (
    <>
      <PageHeader
        title="WhatsApp Inbox"
        subtitle={list.data ? `${list.data.total} conversation${list.data.total === 1 ? "" : "s"}${list.data.needsHuman ? ` · ${list.data.needsHuman} need${list.data.needsHuman === 1 ? "s" : ""} you` : ""}` : "Every customer conversation in one place"}
        actions={
          <button onClick={() => setNewChat(true)} className="btn-primary">
            <MessageSquarePlus className="h-4 w-4" /> New chat
          </button>
        }
      />

      <div className="px-4 py-4 lg:px-6">
        <div className="card grid h-[calc(100vh-12rem)] min-h-[28rem] overflow-hidden lg:grid-cols-[22rem_1fr]">
          {/* Conversations */}
          <div className={clsx("flex min-h-0 flex-col border-r border-line", selected && "hidden lg:flex")}>
            <div className="space-y-2 border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or number" className="field pl-9" />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-muted">
                <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} />
                Needs me (human takeover)
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.isPending ? (
                <TableSkeleton />
              ) : list.isError ? (
                <p className="p-4 text-sm text-red-600">{(list.error as Error).message}</p>
              ) : !list.data.items.length ? (
                <p className="p-6 text-center text-[13px] text-muted">
                  {search || needsOnly ? "No conversation matches." : "No conversations yet. They appear here when a customer writes in."}
                </p>
              ) : (
                list.data.items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelected(conv.id)}
                    className={clsx("flex w-full items-start gap-3 border-b border-line/70 px-3 py-3 text-left transition hover:bg-bg-light", selected === conv.id && "bg-gold-pale/30")}
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy/10 text-[12px] font-bold text-navy">
                      {(conv.name ?? "#").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-navy">{conv.name ?? formatPhone(conv.phone)}</span>
                        <span className="shrink-0 text-[11px] text-muted">{timeOf(conv.lastMessageAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] text-muted">{conv.lastPreview ?? "—"}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {conv.needsHuman && <Hand className="h-3.5 w-3.5 text-amber-600" aria-label="Needs a person" />}
                          {conv.unreadCount > 0 && (
                            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">{conv.unreadCount}</span>
                          )}
                        </span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={clsx("flex min-h-0 flex-col bg-bg-light/50", !selected && "hidden lg:flex")}>
            {!selected || !c ? (
              <div className="grid flex-1 place-items-center p-6 text-center">
                {selected && thread.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted" />
                ) : (
                  <div>
                    <MessageSquarePlus className="mx-auto h-8 w-8 text-emerald-600/70" />
                    <p className="mt-2 text-[13px] text-muted">Select a conversation to view messages</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3">
                  <button onClick={() => setSelected(null)} className="rounded p-1 text-muted hover:bg-bg-light lg:hidden" aria-label="Back to conversations">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy">{c.name ?? formatPhone(c.phone)}</p>
                    <p className="text-[12px] text-muted">
                      {formatPhone(c.phone)}
                      {c.lead && (
                        <>
                          {" · "}
                          <Link to="/leads/$leadId" params={{ leadId: c.lead.id }} className="font-semibold text-navy hover:text-gold-dark">
                            Lead #{c.lead.leadNo}
                          </Link>
                        </>
                      )}
                      {c.application && (
                        <>
                          {" · "}
                          <Link to="/applications/$applicationId" params={{ applicationId: c.application.id }} className="font-semibold text-navy hover:text-gold-dark">
                            {c.application.applicationNo}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold", left ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                    <Clock className="h-3 w-3" /> {left ?? "24h window closed"}
                  </span>
                  <button
                    onClick={() => flag.mutate(!c.needsHuman)}
                    title={c.needsHuman ? "Hand this back to the chatbot" : "Mark as needing a person — the chatbot stays quiet"}
                    className={clsx("btn-ghost", c.needsHuman && "!border-amber-300 !bg-amber-50 !text-amber-800")}
                  >
                    <Hand className="h-4 w-4" /> {c.needsHuman ? "Needs me" : "Take over"}
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                  {(thread.data?.messages ?? []).map((m) => (
                    <Bubble key={m.id} m={m} />
                  ))}
                  <div ref={bottom} />
                </div>

                <div className="border-t border-line bg-white p-3">
                  {send.isError && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(send.error as Error).message}</p>}
                  {left ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.trim()) send.mutate({ text: draft });
                      }}
                      className="flex items-end gap-2"
                    >
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (draft.trim() && !send.isPending) send.mutate({ text: draft });
                          }
                        }}
                        rows={1}
                        maxLength={4000}
                        placeholder="Type a reply…"
                        className="field max-h-32 min-h-[2.5rem] flex-1 resize-none py-2"
                      />
                      <button type="submit" disabled={!draft.trim() || send.isPending} className="btn-primary !px-3 !py-2.5" aria-label="Send">
                        {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </form>
                  ) : (
                    <div>
                      <p className="mb-2 text-[12px] text-muted">
                        The customer last wrote more than 24 hours ago, so WhatsApp only lets you send an approved template.
                      </p>
                      <TemplatePicker
                        templates={approvedTemplates}
                        conversationName={c.name}
                        pending={send.isPending}
                        onSend={(templateId, variables) => send.mutate({ templateId, variables })}
                      />
                      {!approvedTemplates.length && <p className="mt-2 text-[12px] text-muted">There are no customer templates yet. An admin can add them under Notification templates.</p>}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {newChat && (
        <NewChat
          templates={approvedTemplates}
          onClose={() => setNewChat(false)}
          onStarted={(id) => {
            setNewChat(false);
            setSelected(id);
            refresh();
          }}
        />
      )}
    </>
  );
}
