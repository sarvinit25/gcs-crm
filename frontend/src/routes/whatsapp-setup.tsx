import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Bot, CheckCircle2, Info, Link2, Loader2, MessageCircle, Plug, Send, Sunrise, Sunset, Terminal } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { META_STATUS_LABEL, formatPhone, type MetaStatus, type NotificationTemplate, type SetupStatus } from "../lib/whatsapp";
import { PageHeader } from "../components/app-shell";
import { Switch } from "../components/switch";

type SettingRow = { key: string; value: unknown };

const CUSTOMER_COMMANDS: [string, string][] = [
  ["hi / hello / namaste", "Welcome message and the list of commands"],
  ["status", "Where their loan file stands (stage only)"],
  ["agent / human / callback", "Hands the chat to a team member — the bot goes quiet"],
  ["help", "Shows the commands again"],
  ["Anything else", "Flagged “Needs me” in the inbox for a person to answer"],
  ["A document or photo", "Acknowledged and flagged for a person"],
];

const EMPLOYEE_COMMANDS: [string, string][] = [
  ["help", "Shows what the assistant can do"],
  ["reset / clear", "Starts a fresh conversation"],
  ["cancel / exit", "Stops the current question and clears the chat"],
  ["Natural language", "Ask in English or Hinglish — “How many active files?”, “Aaj ke follow-ups”. It answers from live CRM data, limited to what your own login can see"],
];

function Card({ icon: Icon, title, right, children }: { icon: typeof Plug; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
          <Icon className="h-4 w-4 text-gold-dark" /> {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line/70 py-3 first:border-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-navy">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function WhatsAppSetupPage() {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const status = useQuery({ queryKey: ["wa-setup"], queryFn: () => api<SetupStatus>("/whatsapp/setup/status") });
  const settings = useQuery({
    queryKey: ["wa-settings"],
    queryFn: async () => {
      const all = await api<{ settings: (SettingRow & { group: string })[] }>("/settings");
      return Object.fromEntries(all.settings.filter((s) => s.group === "WhatsApp").map((s) => [s.key, s.value]));
    },
  });
  const templates = useQuery({ queryKey: ["wa-templates"], queryFn: () => api<NotificationTemplate[]>("/notifications/templates") });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api(`/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["wa-settings"] }),
    onError: (e) => setNote({ tone: "error", text: (e as Error).message }),
  });
  const set = (key: string, value: unknown) => save.mutate({ key, value });
  const v = settings.data ?? {};

  const [testTo, setTestTo] = useState("");
  const [testTemplate, setTestTemplate] = useState("");
  const test = useMutation({
    mutationFn: () => api("/whatsapp/setup/test", { method: "POST", body: JSON.stringify({ to: testTo, templateId: testTemplate }) }),
    onSuccess: () => setNote({ tone: "ok", text: "Test message sent. Check the phone." }),
    onError: (e) => setNote({ tone: "error", text: (e as Error).message }),
  });
  const brief = useMutation({
    mutationFn: (kind: "morning" | "evening") => api("/whatsapp/setup/briefs", { method: "POST", body: JSON.stringify({ kind }) }),
    onSuccess: () => setNote({ tone: "ok", text: "Brief sent — see Notification logs for the result." }),
    onError: (e) => setNote({ tone: "error", text: (e as Error).message }),
  });

  // The two text-like settings are edited locally and saved together, not on every keystroke.
  const [timeout, setTimeoutMin] = useState("30");
  const [morning, setMorning] = useState("09:00");
  const [evening, setEvening] = useState("18:30");
  const [recipients, setRecipients] = useState("");
  useEffect(() => {
    if (!settings.data) return;
    setTimeoutMin(String(settings.data["whatsapp.sessionTimeoutMinutes"] ?? 30));
    setMorning(String(settings.data["whatsapp.morningBriefTime"] ?? "09:00"));
    setEvening(String(settings.data["whatsapp.eveningBriefTime"] ?? "18:30"));
    setRecipients(((settings.data["whatsapp.briefRecipients"] as string[]) ?? []).join("\n"));
  }, [settings.data]);

  const c = status.data?.connection;
  const connected = c?.state === "connected";
  const counts = status.data?.templates ?? {};
  const approvedTemplates = (templates.data ?? []).filter((t) => t.metaStatus === "APPROVED" || !status.data?.requiresApproval);

  return (
    <>
      <PageHeader title="WhatsApp setup" subtitle="Connection, chatbot and automatic messages" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 lg:px-6">
        {note && <p className={clsx("rounded-md px-3 py-2 text-[13px]", note.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{note.text}</p>}

        <Card
          icon={Plug}
          title="WhatsApp connection"
          right={
            c && (
              <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold", connected ? "bg-emerald-50 text-emerald-700" : c.state === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
                {connected ? "Connected" : c.state === "error" ? "Problem" : "Not connected"}
              </span>
            )
          }
        >
          {status.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : status.isError ? (
            <p className="text-sm text-red-600">{(status.error as Error).message}</p>
          ) : (
            <>
              {c && !connected && (
                <div className="mb-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{c.state === "error" ? "WhatsApp answered with a problem" : "WhatsApp isn't connected yet"}</p>
                    <p className="mt-0.5">{c.message}</p>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Number", c?.phoneNumber ? (c.phoneNumber.startsWith("+") ? c.phoneNumber : formatPhone(c.phoneNumber)) : "—"],
                  ["Verified name", c?.verifiedName ?? "—"],
                  ["Quality", c?.quality ? c.quality.charAt(0) + c.quality.slice(1).toLowerCase() : "—"],
                  ["Phone number ID", c?.phoneNumberId ?? "—"],
                  ["WhatsApp Business Account ID", c?.wabaId ?? "—"],
                  ["Provider", c?.provider === "meta" ? "Meta Cloud API" : c?.provider === "sandbox" ? "Sandbox (testing)" : "None"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-bg-light p-3">
                    <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-navy">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-line p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-navy">
                  <Link2 className="h-3.5 w-3.5" /> Set on the server
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["accessToken", "Access token"],
                      ["phoneNumberId", "Phone number ID"],
                      ["wabaId", "WABA ID"],
                      ["appSecret", "App secret"],
                      ["verifyToken", "Verify token"],
                    ] as const
                  ).map(([k, label]) => (
                    <span key={k} className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", status.data.credentials[k] ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      {status.data.credentials[k] ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-slate-300" />} {label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  In Meta's WhatsApp → Configuration, set the webhook address to{" "}
                  <code className="rounded bg-bg-light px-1 py-0.5 text-[11px]">https://&lt;your-site&gt;{status.data.webhookPath}</code>, use your verify token, and subscribe to <b>messages</b>. The secrets live in the server's environment, never on this screen.
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-line p-3">
                <p className="mb-1 text-[12px] font-bold text-navy">Send a test message</p>
                <p className="mb-2 text-[12px] text-muted">Sends an approved template to a phone, to prove the connection works end to end.</p>
                <div className="flex flex-wrap gap-2">
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Phone with country code, e.g. 9198xxxxxx" className="field w-64" inputMode="tel" />
                  <select value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)} className="field w-64">
                    <option value="">Choose a template…</option>
                    {approvedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => test.mutate()} disabled={!testTo || !testTemplate || test.isPending} className="btn-primary">
                    {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
                Templates:{" "}
                {(Object.keys(META_STATUS_LABEL) as MetaStatus[]).filter((s) => counts[s]).map((s) => (
                  <span key={s} className="rounded-full bg-bg-light px-2 py-0.5 font-semibold">
                    {counts[s]} {META_STATUS_LABEL[s].toLowerCase()}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card icon={Bot} title="AI employee / chatbot">
          {settings.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : (
            <>
              <Row label="Chatbot enabled" hint="Customers can type hi, status or help at any hour; team members can ask the CRM assistant in plain language. Turn off to answer everything by hand.">
                <Switch checked={Boolean(v["whatsapp.chatbotEnabled"])} onChange={(x) => set("whatsapp.chatbotEnabled", x)} label="Chatbot enabled" />
              </Row>
              <Row label="Session timeout (minutes)" hint="How long a team member's chat with the assistant is remembered.">
                <div className="flex items-center gap-2">
                  <input value={timeout} onChange={(e) => setTimeoutMin(e.target.value)} type="number" min={1} max={720} className="field w-24" />
                  <button onClick={() => set("whatsapp.sessionTimeoutMinutes", Number(timeout))} className="btn-ghost">
                    Save
                  </button>
                </div>
              </Row>
              <p className="mt-1 text-[12px] text-muted">
                The company name used in welcome messages comes from Settings → Organisation. The assistant needs the OpenAI key on the server (see the CRM assistant).
              </p>
            </>
          )}
        </Card>

        <Card icon={Bell} title="WhatsApp notifications">
          {settings.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : (
            <>
              <Row label="Send automatic messages to customers" hint="Off by default. Turn it on only once customers have agreed to hear from you on WhatsApp.">
                <Switch checked={Boolean(v["whatsapp.customerMessagesEnabled"])} onChange={(x) => set("whatsapp.customerMessagesEnabled", x)} label="Customer messages" />
              </Row>
              <Row label="Send alerts to the team" hint="A WhatsApp to the officer when a lead is assigned or their file moves.">
                <Switch checked={Boolean(v["whatsapp.employeeAlertsEnabled"])} onChange={(x) => set("whatsapp.employeeAlertsEnabled", x)} label="Team alerts" />
              </Row>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="/crm/notifications/templates" className="btn-ghost">
                  Manage notification templates
                </a>
                <a href="/crm/notifications/logs" className="btn-ghost">
                  View notification logs
                </a>
              </div>
            </>
          )}
        </Card>

        <Card icon={Sunrise} title="Daily briefs">
          {settings.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : (
            <>
              <Row label="Send the morning and evening briefs" hint="A short summary to the phones below: files in progress, follow-ups due, new leads, and the day's sanctions and payouts.">
                <Switch checked={Boolean(v["whatsapp.briefsEnabled"])} onChange={(x) => set("whatsapp.briefsEnabled", x)} label="Daily briefs" />
              </Row>
              <div className="grid gap-3 border-t border-line/70 py-3 sm:grid-cols-2">
                <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                  <span className="flex items-center gap-1"><Sunrise className="h-3.5 w-3.5" /> Morning brief (India time)</span>
                  <input type="time" value={morning} onChange={(e) => setMorning(e.target.value)} className="field mt-1" />
                </label>
                <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                  <span className="flex items-center gap-1"><Sunset className="h-3.5 w-3.5" /> Evening brief (India time)</span>
                  <input type="time" value={evening} onChange={(e) => setEvening(e.target.value)} className="field mt-1" />
                </label>
              </div>
              <label className="block text-[11px] font-bold tracking-wide text-muted uppercase">
                Who gets them — one phone number per line (empty = every admin with a phone on their profile)
                <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={3} className="field mt-1 font-normal tracking-normal normal-case" placeholder="9820592765" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    set("whatsapp.morningBriefTime", morning);
                    set("whatsapp.eveningBriefTime", evening);
                    set("whatsapp.briefRecipients", recipients.split("\n").map((p) => p.trim()).filter(Boolean));
                    setNote({ tone: "ok", text: "Brief settings saved." });
                  }}
                  className="btn-primary"
                >
                  Save brief settings
                </button>
                <button onClick={() => brief.mutate("morning")} disabled={brief.isPending} className="btn-ghost">
                  Send morning brief now
                </button>
                <button onClick={() => brief.mutate("evening")} disabled={brief.isPending} className="btn-ghost">
                  Send evening brief now
                </button>
              </div>
            </>
          )}
        </Card>

        <Card icon={Terminal} title="Bot commands reference">
          <div className="grid gap-5 md:grid-cols-2">
            {[
              ["Customer commands", CUSTOMER_COMMANDS],
              ["Team member commands", EMPLOYEE_COMMANDS],
            ].map(([title, rows]) => (
              <div key={title as string}>
                <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">{title as string}</p>
                <dl className="space-y-2">
                  {(rows as [string, string][]).map(([cmd, what]) => (
                    <div key={cmd} className="grid grid-cols-[9rem_1fr] gap-2 text-[12px]">
                      <dt className="font-semibold text-navy">{cmd}</dt>
                      <dd className="text-muted">{what}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Card>

        <section className="flex gap-3 rounded-xl border border-line bg-white p-4 text-[12px] text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
          <div className="space-y-1">
            <p className="font-semibold text-navy">How it works</p>
            <p>
              <MessageCircle className="mr-1 inline h-3 w-3" />
              <b>Customers</b> can start an enquiry on WhatsApp; it becomes a lead and appears in the inbox. Free-form replies are allowed for 24 hours after their last message; after that only approved templates can be sent.
            </p>
            <p>
              <b>Team members</b> write from the phone number on their CRM profile and get the assistant, limited to what their own login can see. Those chats are not stored in the inbox.
            </p>
            <p>
              <b>Notifications</b> are sent when key events happen — lead created, file stage changed, sanction approved, disbursal completed. Each one is logged, including those held back and why.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
