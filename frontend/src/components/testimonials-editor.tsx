import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Download, Eye, EyeOff, Inbox, Link2, Loader2, MessageCircle, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import clsx from "clsx";
import { api, tokenStore } from "../lib/api";
import { Modal } from "./modal";
import { ask } from "./confirm";

export type Consent = { given?: boolean; photoOk?: boolean; how?: string; date?: string; note?: string };
export type Testimonial = {
  name: string;
  city: string;
  product: string;
  role?: string;
  rating: number;
  quote: string;
  visible: boolean;
  /** A picture uploaded through the CRM, as a path like /public/site-images/<id>. */
  photo?: string;
  consent?: Consent;
};

const HOW = ["Signed form (Word)", "Email", "WhatsApp message", "Spoken, noted by us", "Other"];
const BLANK: Testimonial = { name: "", city: "", product: "", role: "", rating: 5, quote: "", visible: false, photo: "", consent: {} };
const FORM_URL = "/crm/forms/GCS-Testimonial-Form.docx";

const photoSrc = (p?: string) => (p ? (p.startsWith("/public/") ? `/crm/api${p}` : p) : "");
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const stars = (r: number) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));

/** A story may go on the website only once the client's consent is on record (and photo consent too, if it has a photo). */
export const canShow = (t: Testimonial) => Boolean(t.consent?.given) && (!t.photo || Boolean(t.consent?.photoOk));

function Avatar({ t, size = "h-14 w-14" }: { t: Testimonial; size?: string }) {
  return t.photo ? (
    <img src={photoSrc(t.photo)} alt="" className={clsx(size, "shrink-0 rounded-full object-cover ring-1 ring-line")} />
  ) : (
    <span className={clsx(size, "grid shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-gold-light")}>{initials(t.name)}</span>
  );
}

function Card({ t, onEdit, onToggle, onDelete }: { t: Testimonial; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const shown = t.visible !== false;
  const ok = canShow(t);
  return (
    <li className={clsx("flex flex-col gap-3 rounded-xl border bg-white p-4", shown ? "border-line" : "border-dashed border-line opacity-80")}>
      <div className="flex items-start gap-3">
        <Avatar t={t} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-navy">{t.name || "New story"}</p>
          <p className="truncate text-[12px] text-muted">{[t.role, t.city, t.product].filter(Boolean).join(" · ") || "Details not filled in"}</p>
          <p className="text-[13px] text-gold-dark" aria-label={`${t.rating} out of 5`}>{stars(t.rating)}</p>
        </div>
        <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", shown ? "bg-emerald-50 text-emerald-700" : "bg-bg-light text-muted")}>{shown ? "Shown" : "Hidden"}</span>
      </div>
      <p className="line-clamp-4 text-[13px] text-ink italic">{t.quote ? `"${t.quote}"` : <span className="text-muted not-italic">No words yet</span>}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {ok ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Consent on record{t.photo ? " (with photo)" : ""}</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {t.consent?.given && t.photo ? "No photo consent" : "No consent on record"}</span>
        )}
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-3">
        <button type="button" className="btn-ghost" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</button>
        <button type="button" className="btn-ghost" onClick={onToggle} disabled={!shown && !ok} title={!shown && !ok ? "Record the client's consent before showing this" : undefined}>
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {shown ? "Hide" : "Show"}
        </button>
        <button type="button" className="btn-ghost text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</button>
      </div>
    </li>
  );
}

function EditModal({ initial, onDone, onClose }: { initial: Testimonial; onDone: (t: Testimonial) => void; onClose: () => void }) {
  const [t, setT] = useState<Testimonial>({ ...BLANK, ...initial, consent: { ...(initial.consent ?? {}) } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const patch = (next: Partial<Testimonial>) => setT((x) => ({ ...x, ...next }));
  const consent = (next: Partial<Consent>) => setT((x) => ({ ...x, consent: { ...(x.consent ?? {}), ...next } }));
  const ok = canShow(t);

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/crm/api/settings/site-images", { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` }, body });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Upload failed");
      const { path } = (await res.json()) as { path: string };
      patch({ photo: path });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const problem = !t.name.trim() ? "Add the client's name." : !t.quote.trim() ? "Add what they said." : t.visible && !ok ? "To show this on the website, record the client's consent first." : "";

  return (
    <Modal title={initial.name ? "Edit story" : "New story"} subtitle="What a client said about us, with their photo and permission" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar t={t} size="h-20 w-20" />
          <div className="space-y-1">
            <label className="btn-ghost cursor-pointer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t.photo ? "Change photo" : "Add photo"}
              <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
            </label>
            {t.photo && <button type="button" className="ml-2 text-[12px] font-semibold text-muted hover:text-red-600" onClick={() => patch({ photo: "" })}>Remove</button>}
            <p className="text-[11px] text-muted">JPG, PNG or WebP, up to 2 MB. A clear, front-facing photo works best.</p>
            {error && <p className="text-[12px] font-medium text-red-600">{error}</p>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-[11px] font-bold tracking-wide text-muted uppercase">Name</span><input className="field mt-1 w-full" value={t.name} maxLength={120} onChange={(e) => patch({ name: e.target.value })} /></label>
          <label className="block"><span className="text-[11px] font-bold tracking-wide text-muted uppercase">Work (optional)</span><input className="field mt-1 w-full" value={t.role ?? ""} maxLength={120} placeholder="Shop owner, engineer…" onChange={(e) => patch({ role: e.target.value })} /></label>
          <label className="block"><span className="text-[11px] font-bold tracking-wide text-muted uppercase">City</span><input className="field mt-1 w-full" value={t.city} maxLength={80} list="story-cities" onChange={(e) => patch({ city: e.target.value })} /></label>
          <label className="block"><span className="text-[11px] font-bold tracking-wide text-muted uppercase">Loan taken</span><input className="field mt-1 w-full" value={t.product} maxLength={120} list="story-loans" onChange={(e) => patch({ product: e.target.value })} /></label>
          <label className="block">
            <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Rating</span>
            <select className="field mt-1 w-full" value={String(t.rating)} onChange={(e) => patch({ rating: Number(e.target.value) })}>
              {[5, 4.5, 4, 3.5, 3].map((r) => <option key={r} value={r}>{stars(r)}  {r}</option>)}
            </select>
          </label>
          <datalist id="story-cities">{["Mumbai", "Thane", "Navi Mumbai", "Pune", "Kalyan", "Panvel", "Nashik"].map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="story-loans">{["Home Loan", "Home Loan Balance Transfer", "Loan Against Property", "Business Loan", "Personal Loan", "Education Loan", "Car Loan"].map((c) => <option key={c} value={c} />)}</datalist>
        </div>

        <label className="block">
          <span className="flex justify-between text-[11px] font-bold tracking-wide text-muted uppercase"><span>What they said</span><span className="font-normal normal-case">{t.quote.length}/1200</span></span>
          <textarea className="field mt-1 w-full" rows={4} maxLength={1200} value={t.quote} onChange={(e) => patch({ quote: e.target.value })} />
        </label>

        <div className="space-y-2 rounded-lg border border-line bg-bg-light/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-bold tracking-wide text-navy uppercase">Client's permission</p>
            <a className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy underline" href={FORM_URL} download><Download className="h-3.5 w-3.5" /> Download the client form (Word)</a>
          </div>
          <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={Boolean(t.consent?.given)} onChange={(e) => consent({ given: e.target.checked, ...(e.target.checked ? {} : { photoOk: false }) })} /><span>The client agreed to us publishing their words, name and city.</span></label>
          <label className={clsx("flex items-start gap-2 text-[13px]", !t.consent?.given && "opacity-50")}><input type="checkbox" className="mt-0.5" disabled={!t.consent?.given} checked={Boolean(t.consent?.photoOk)} onChange={(e) => consent({ photoOk: e.target.checked })} /><span>The client also agreed to their photo being used.</span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-[11px] font-bold tracking-wide text-muted uppercase">How was it given?</span>
              <select className="field mt-1 w-full" value={t.consent?.how ?? ""} onChange={(e) => consent({ how: e.target.value })}><option value="">Select…</option>{HOW.map((h) => <option key={h}>{h}</option>)}</select></label>
            <label className="block"><span className="text-[11px] font-bold tracking-wide text-muted uppercase">Date given</span><input type="date" className="field mt-1 w-full" value={t.consent?.date ?? ""} onChange={(e) => consent({ date: e.target.value })} /></label>
          </div>
          <label className="block"><span className="text-[11px] font-bold tracking-wide text-muted uppercase">Note (private, never shown on the site)</span><input className="field mt-1 w-full" maxLength={300} value={t.consent?.note ?? ""} placeholder="For example: form received on WhatsApp, saved in the client's file" onChange={(e) => consent({ note: e.target.value })} /></label>
          <p className="text-[11px] text-muted">The consent details stay in the CRM. Only the story, and the photo when photo consent is ticked, go to the website.</p>
        </div>

        <label className={clsx("flex items-center gap-2 text-[13px] font-semibold text-navy", !ok && "opacity-60")}>
          <input type="checkbox" disabled={!ok} checked={t.visible !== false && ok} onChange={(e) => patch({ visible: e.target.checked })} />
          Show on the website
          {!ok && <span className="font-normal text-amber-700">(tick the client's permission first{t.photo && !t.consent?.photoOk ? ", including for the photo" : ""})</span>}
        </label>

        {problem && <p className="text-[12px] font-medium text-amber-700">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!t.name.trim() || !t.quote.trim() || (t.visible && !ok)} onClick={() => onDone({ ...t, visible: t.visible && ok, name: t.name.trim(), quote: t.quote.trim() })}>Done</button>
        </div>
        <p className="text-right text-[11px] text-muted">After Done, press Save below the list to put your changes on the website.</p>
      </div>
    </Modal>
  );
}

type Submission = {
  id: string; name: string; city: string | null; product: string | null; role: string | null; contact: string | null;
  rating: number; quote: string; consentPhoto: boolean; signedName: string; status: string; hasPhoto: boolean;
  createdAt: string; reviewedByName: string | null;
};

/** A photo a client sent, fetched with the staff login (it is private until the story is approved). */
function SubPhoto({ id, name }: { id: string; name: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    let gone = false;
    void fetch(`/crm/api/testimonial-submissions/${id}/photo`, { headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && !gone) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => undefined);
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-line" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-gold-light">{initials(name)}</span>;
}

const FORM_PAGE = () => `${window.location.origin}/crm/testimonial`;

/** The link to send clients, and what they have sent back, waiting for you to use it or not. */
function ClientForm({ locked }: { locked: boolean }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const q = useQuery({ queryKey: ["testimonial-submissions"], queryFn: () => api<{ pendingCount: number; items: Submission[] }>("/testimonial-submissions"), refetchInterval: 60_000 });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["testimonial-submissions"] });
    void queryClient.invalidateQueries({ queryKey: ["testimonials-pending"] });
    // The stories list reloads, so the approved one appears in the gallery below.
    void queryClient.invalidateQueries({ queryKey: ["site-content"] });
  };
  const approve = useMutation({ mutationFn: (id: string) => api(`/testimonial-submissions/${id}/approve`, { method: "POST" }), onSuccess: done });
  const reject = useMutation({ mutationFn: (id: string) => api(`/testimonial-submissions/${id}/reject`, { method: "POST" }), onSuccess: done });
  const pending = (q.data?.items ?? []).filter((s) => s.status === "PENDING");
  const link = FORM_PAGE();
  const message = `Hello, thank you for choosing Growth Capital Services. If you have a few minutes, we would love to hear how your experience was. You can share it here, and add your photo if you like: ${link}`;
  const error = (approve.error ?? reject.error) as Error | null;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 text-gold-dark" />
        <p className="text-[13px] font-semibold text-navy">Send clients the online form</p>
        <span className="text-[12px] text-muted">They fill it on their phone, add a photo and sign by typing their name. Nothing goes on the website until you approve it.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded-md border border-line bg-bg-light px-2.5 py-1.5 font-mono text-[12px]" title={link}>{link}</p>
        <button type="button" className="btn-ghost" onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
        </button>
        <a className="btn-primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Share on WhatsApp</a>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-navy uppercase"><Inbox className="h-4 w-4" /> New from clients {pending.length > 0 && <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] text-navy">{pending.length}</span>}</p>
        {q.isPending ? <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted" /> : pending.length === 0 ? <p className="mt-1 text-[12px] text-muted">Nothing waiting. What clients send will appear here.</p> : (
          <ul className="mt-2 space-y-3">
            {pending.map((s) => (
              <li key={s.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start gap-3">
                  {s.hasPhoto ? <SubPhoto id={s.id} name={s.name} /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-gold-light">{initials(s.name)}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-navy">{s.name} <span className="font-normal text-gold-dark">{s.rating}/5</span></p>
                    <p className="text-[12px] text-muted">{[s.role, s.city, s.product].filter(Boolean).join(" · ") || "No details given"}</p>
                    <p className="mt-1.5 text-[13px] text-ink italic">"{s.quote}"</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Agreed to words, name and city</span>
                      <span className={s.consentPhoto ? "font-semibold text-emerald-700" : "text-muted"}>{s.consentPhoto ? "Agreed to photo" : "No photo shared"}</span>
                      <span className="text-muted">Signed as "{s.signedName}"</span>
                      {s.contact && <span className="text-muted">Contact (private): {s.contact}</span>}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button type="button" className="btn-primary" disabled={locked || approve.isPending || reject.isPending} onClick={() => approve.mutate(s.id)} title={locked ? "Save your other changes below first" : undefined}>
                    {approve.isPending && approve.variables === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Add as a story
                  </button>
                  <button type="button" className="btn-ghost text-red-600" disabled={approve.isPending || reject.isPending} onClick={async () => { if ((await ask(`Not use the message from ${s.name}? Their photo will be deleted.`))) reject.mutate(s.id); }}><X className="h-4 w-4" /> Not used</button>
                  {locked && <span className="text-[11px] text-amber-700">Save your other changes below first.</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error.message}</p>}
        {approve.isSuccess && <p className="mt-2 text-[12px] font-medium text-emerald-700">Added below as a hidden story, with the client's permission already recorded. Open it, check it, and choose Show when you are happy.</p>}
      </div>
    </div>
  );
}

/** Client stories: a gallery of cards with photo, words and consent. Edit opens a window; Save below the list publishes. */
export function TestimonialsEditor({ value, onChange, dirty = false }: { value: Testimonial[]; onChange: (v: unknown) => void; dirty?: boolean }) {
  const [editing, setEditing] = useState<{ index: number; story: Testimonial } | null>(null);
  const list = value ?? [];
  const noConsent = list.filter((t) => t.visible !== false && !canShow(t)).length;
  return (
    <div className="space-y-3">
      <ClientForm locked={dirty} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">{list.length} {list.length === 1 ? "story" : "stories"}. Only stories marked Shown appear on the website.</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={FORM_URL} download><Download className="h-4 w-4" /> Client form (Word)</a>
          <button type="button" className="btn-primary" onClick={() => setEditing({ index: -1, story: { ...BLANK } })}><Plus className="h-4 w-4" /> Add story</button>
        </div>
      </div>
      {noConsent > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {noConsent} shown {noConsent === 1 ? "story has" : "stories have"} no consent on record. Open each one and record the client's permission, or hide it.</p>
      )}
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-[13px] text-muted">No stories yet. Send a client the Word form, then add their story here with their photo.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t, i) => (
            <Card key={i} t={t}
              onEdit={() => setEditing({ index: i, story: t })}
              onToggle={() => onChange(list.map((x, j) => (j === i ? { ...x, visible: x.visible === false } : x)))}
              onDelete={async () => { if ((await ask(`Delete the story from ${t.name || "this client"}? This cannot be undone.`))) onChange(list.filter((_, j) => j !== i)); }} />
          ))}
        </ul>
      )}
      {editing && (
        <EditModal initial={editing.story} onClose={() => setEditing(null)}
          onDone={(story) => { onChange(editing.index < 0 ? [...list, story] : list.map((x, j) => (j === editing.index ? story : x))); setEditing(null); }} />
      )}
    </div>
  );
}
