import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Loader2, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { whatsappLink } from "../lib/customer-form";
import { whereLine, type LenderContact, type Paged } from "../lib/lender-contacts";
import { Modal } from "./modal";
import { TableSkeleton } from "./skeleton";

export const useContactSegments = () =>
  useQuery({ queryKey: ["lender-contact-segments"], queryFn: () => api<string[]>("/lender-contacts/segments"), staleTime: 5 * 60_000 });

type Places = { states: string[]; cities: { city: string; state: string | null }[] };
const usePlaces = (lenderId?: string) =>
  useQuery({ queryKey: ["lender-contact-places", lenderId ?? "all"], queryFn: () => api<Places>(`/lender-contacts/places${lenderId ? `?lenderId=${lenderId}` : ""}`), staleTime: 5 * 60_000 });

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Call, WhatsApp and email in one tap each — what you actually want to do with a banker's details. */
export function ContactLinks({ phone, email }: { phone: string | null; email: string | null }) {
  const icon = "rounded p-1.5 text-muted transition hover:bg-bg-light hover:text-navy";
  return (
    <span className="inline-flex items-center">
      {phone && (
        <>
          <a href={`tel:+91${phone}`} className={icon} title={`Call ${phone}`} aria-label={`Call ${phone}`}>
            <Phone className="h-3.5 w-3.5" />
          </a>
          <a href={whatsappLink(phone, "")} target="_blank" rel="noreferrer" className={icon} title="WhatsApp" aria-label="WhatsApp">
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        </>
      )}
      {email && (
        <a href={`mailto:${email}`} className={icon} title={email} aria-label={`Email ${email}`}>
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

function Segments({ segments }: { segments: string[] }) {
  if (!segments.length) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {segments.map((s) => (
        <span key={s} className="rounded-full bg-navy/8 px-2 py-0.5 text-[11px] font-semibold text-navy">
          {s}
        </span>
      ))}
    </span>
  );
}

/** Add or change one person. When opened from a lender the bank is fixed; from the directory it is chosen. */
export function ContactEditor({
  contact,
  lenders,
  lenderId,
  onClose,
}: {
  contact?: LenderContact;
  lenders: { id: string; name: string }[];
  lenderId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const segments = useContactSegments();
  const [picked, setPicked] = useState<string[]>(contact?.segments ?? []);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      contact
        ? api(`/lender-contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/lender-contacts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lender-contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["lender-contact-places"] });
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["lender"] });
      onClose();
    },
  });
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  return (
    <Modal title={contact ? "Edit contact" : "Add a contact"} subtitle={contact?.lender.name} onClose={onClose} maxWidth="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const text = (k: string) => ((f.get(k) as string) ?? "").trim();
          const optional = (k: string) => text(k) || (contact ? null : undefined);
          save.mutate({
            ...(contact ? {} : { lenderId: lenderId ?? text("lenderId") }),
            name: text("name"),
            designation: optional("designation"),
            phone: optional("phone"),
            email: optional("email"),
            notes: optional("notes"),
            city: optional("city"),
            state: optional("state"),
            branch: optional("branch"),
            region: optional("region"),
            kind: text("kind") || undefined,
            segments: picked,
          });
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        {!contact && !lenderId && (
          <label className="text-[13px] font-semibold text-navy sm:col-span-2">
            Bank / NBFC
            <select name="lenderId" required className="field mt-1.5 font-normal" defaultValue="">
              <option value="" disabled>Choose…</option>
              {lenders.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-[13px] font-semibold text-navy">
          Name
          <input name="name" required minLength={2} defaultValue={contact?.name} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Role
          <input name="designation" defaultValue={contact ? (contact.designation ?? "") : "Sales Manager"} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Mobile
          <input name="phone" inputMode="tel" defaultValue={contact?.phone ?? ""} placeholder="10-digit number" className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Email
          <input name="email" type="email" defaultValue={contact?.email ?? ""} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          City
          <input name="city" defaultValue={contact?.city ?? ""} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          State
          <input name="state" defaultValue={contact?.state ?? ""} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Branch
          <input name="branch" defaultValue={contact?.branch ?? ""} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Type of contact
          <select name="kind" defaultValue={contact?.kind ?? "RELATIONSHIP"} className="field mt-1.5 font-normal">
            <option value="RELATIONSHIP">Relationship manager — takes our files</option>
            <option value="DIRECTORY">Regional / branch / escalation name</option>
          </select>
        </label>
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Region / territory
          <input name="region" defaultValue={contact?.region ?? ""} placeholder="e.g. West › Mumbai North" className="field mt-1.5 font-normal" />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-[13px] font-semibold text-navy">Loan types they handle</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(segments.data ?? []).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => toggle(s)}
                aria-pressed={picked.includes(s)}
                className={clsx("rounded-full border px-2.5 py-1 text-[12px] font-semibold transition", picked.includes(s) ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy/40")}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Notes
          <textarea name="notes" defaultValue={contact?.notes ?? ""} maxLength={500} className="field mt-1.5 min-h-16 font-normal" />
        </label>
        {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 sm:col-span-2">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {contact ? "Save changes" : "Add contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function useRemove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/lender-contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lender-contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["lender"] });
    },
  });
}

const HEAD = "px-4 py-2.5 font-bold";

/** The extra detail a lender's own list carried: the people above them, what they cover, codes and so on. */
function ContactDetail({ c, colSpan }: { c: LenderContact; colSpan: number }) {
  const rows = Object.entries(c.details ?? {});
  return (
    <tr className="border-b border-line/70 bg-bg-light/40">
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="grid gap-x-8 gap-y-3 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
          {!!c.escalation?.length && (
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Escalation — people above</p>
              <ul className="space-y-1">
                {c.escalation.map((e, i) => (
                  <li key={`${e.name}-${i}`} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold text-navy">{e.name}</span>
                      {e.role && <span className="text-muted"> · {e.role}</span>}
                      {e.phone && <span className="font-mono text-muted"> · {e.phone}</span>}
                    </span>
                    <ContactLinks phone={e.phone} email={e.email} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(c.coverage || c.region) && (
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Covers</p>
              {c.region && <p className="text-ink">{c.region}</p>}
              {c.coverage && <p className="text-muted">{c.coverage}</p>}
            </div>
          )}
          {(rows.length > 0 || c.employeeCode || c.altPhone) && (
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">More details</p>
              <dl className="space-y-0.5">
                {c.altPhone && (
                  <div className="flex gap-2"><dt className="text-muted">Other number</dt><dd className="font-mono text-ink">{c.altPhone}</dd></div>
                )}
                {c.employeeCode && (
                  <div className="flex gap-2"><dt className="text-muted">Employee code</dt><dd className="text-ink">{c.employeeCode}</dd></div>
                )}
                {rows.map(([k, v]) => (
                  <div key={k} className="flex gap-2"><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>
                ))}
              </dl>
            </div>
          )}
        </div>
        {c.source && <p className="mt-2 text-[11px] text-muted">From: {c.source}</p>}
      </td>
    </tr>
  );
}

function hasMore(c: LenderContact) {
  return !!(c.escalation?.length || c.coverage || c.region || c.employeeCode || c.altPhone || (c.details && Object.keys(c.details).length) || c.source);
}

function ContactRows({
  contacts,
  showLender,
  canEdit,
  onEdit,
}: {
  contacts: LenderContact[];
  showLender: boolean;
  canEdit: boolean;
  onEdit: (c: LenderContact) => void;
}) {
  const remove = useRemove();
  const [open, setOpen] = useState<string | null>(null);
  const cols = showLender ? 6 : 5;
  return (
    <>
      {contacts.map((c) => {
        const where = whereLine(c);
        return (
          <Fragment key={c.id}>
            <tr className={clsx("border-b border-line/70 align-top", open !== c.id && "last:border-0", !c.active && "opacity-50")}>
              <td className="px-4 py-3">
                <div className="flex items-start gap-1.5">
                  {hasMore(c) ? (
                    <button
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                      aria-expanded={open === c.id}
                      aria-label={`${open === c.id ? "Hide" : "Show"} details for ${c.name}`}
                      className="mt-0.5 rounded p-0.5 text-muted hover:bg-bg-light hover:text-navy"
                    >
                      <ChevronDown className={clsx("h-3.5 w-3.5 transition", open === c.id && "rotate-180")} />
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-navy">{c.name}</p>
                    {c.designation && <p className="text-[12px] text-muted">{c.designation}</p>}
                    {c.kind === "DIRECTORY" && <span className="mt-0.5 inline-block rounded bg-bg-light px-1.5 py-px text-[10px] font-bold tracking-wide text-muted uppercase">Directory</span>}
                    {c.notes && (
                      <p className="mt-1 flex items-start gap-1 text-[12px] text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span>{c.notes}</span>
                      </p>
                    )}
                  </div>
                </div>
              </td>
              {showLender && <td className="px-4 py-3 text-ink">{c.lender.name}</td>}
              <td className="px-4 py-3 text-[12.5px] text-ink">
                {where ? (
                  <span className="inline-flex items-start gap-1">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted" /> {where}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <p className="font-mono text-[12px] text-ink">{c.phone ?? "—"}</p>
                <p className="text-[12px] break-all text-muted">{c.email ?? ""}</p>
              </td>
              <td className="px-4 py-3"><Segments segments={c.segments} /></td>
              <td className="px-4 py-3 whitespace-nowrap">
                <ContactLinks phone={c.phone} email={c.email} />
                {canEdit && (
                  <>
                    <button onClick={() => onEdit(c)} className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy" title="Edit" aria-label={`Edit ${c.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => window.confirm(`Remove ${c.name} from the directory?`) && remove.mutate(c.id)}
                      className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-red-600"
                      title="Remove"
                      aria-label={`Remove ${c.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </td>
            </tr>
            {open === c.id && <ContactDetail c={c} colSpan={cols} />}
          </Fragment>
        );
      })}
    </>
  );
}

function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const btn = "btn-ghost !px-2 disabled:opacity-40";
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted">
      <span>
        Showing {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
      </span>
      <span className="flex items-center gap-2">
        <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          Page {page} of {pages.toLocaleString("en-IN")}
        </span>
        <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}

const PAGE_SIZE = 50;

/**
 * Search and browse the people at banks and NBFCs — by name, number, town, state, loan type or kind.
 * With `lenderId` it shows one lender; without, everyone, "who do I call at ICICI in Pune for a LAP?"
 */
export function ContactBrowser({ lenders, lenderId }: { lenders: { id: string; name: string }[]; lenderId?: string }) {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [search, setSearch] = useState("");
  const [lender, setLender] = useState("");
  const [segment, setSegment] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [cityName, setCityName] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LenderContact | "new" | null>(null);
  const segments = useContactSegments();
  const places = usePlaces(lenderId);
  const q = useDebounced(search);
  const effectiveLender = lenderId ?? lender;

  // any change of filter starts again from the first page
  useEffect(() => setPage(1), [q, effectiveLender, segment, kind, state, cityName]);

  const cities = useMemo(
    () => (places.data?.cities ?? []).filter((c) => !state || c.state === state).map((c) => c.city),
    [places.data, state],
  );
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
  if (q.trim()) params.set("search", q.trim());
  if (effectiveLender) params.set("lenderId", effectiveLender);
  if (segment) params.set("segment", segment);
  if (kind) params.set("kind", kind);
  if (state) params.set("state", state);
  if (cityName) params.set("city", cityName);
  const query = useQuery({
    queryKey: ["lender-contacts", params.toString()],
    queryFn: () => api<Paged<LenderContact>>(`/lender-contacts?${params}&includeInactive=${lenderId ? "true" : "false"}`),
    placeholderData: (prev) => prev,
  });
  const total = query.data?.total ?? 0;
  const filtered = Boolean(q.trim() || lender || segment || kind || state || cityName);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, number, email, town or bank" className="field w-72 pl-9" />
        </div>
        {!lenderId && (
          <select value={lender} onChange={(e) => setLender(e.target.value)} className="field w-48" aria-label="Bank or NBFC">
            <option value="">All banks & NBFCs</option>
            {lenders.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className="field w-44" aria-label="Loan type">
          <option value="">All loan types</option>
          {(segments.data ?? []).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={state} onChange={(e) => { setState(e.target.value); setCityName(""); }} className="field w-40" aria-label="State">
          <option value="">All states</option>
          {(places.data?.states ?? []).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={cityName} onChange={(e) => setCityName(e.target.value)} className="field w-40" aria-label="City">
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="field w-56" aria-label="Type of contact">
          <option value="">Everyone</option>
          <option value="RELATIONSHIP">Relationship managers</option>
          <option value="DIRECTORY">Regional & branch directory</option>
        </select>
        <span className="text-[13px] text-muted">
          {query.data ? `${total.toLocaleString("en-IN")} ${total === 1 ? "person" : "people"}` : ""}
        </span>
        {canEdit && (
          <button className="btn-primary ml-auto" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add contact
          </button>
        )}
      </div>
      <div className="card overflow-x-auto">
        {query.isPending ? (
          <TableSkeleton />
        ) : query.data?.items.length ? (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className={HEAD}>Person</th>
                {!lenderId && <th className={HEAD}>Bank / NBFC</th>}
                <th className={HEAD}>Where</th>
                <th className={HEAD}>Contact</th>
                <th className={HEAD}>Loan types</th>
                <th className={HEAD} />
              </tr>
            </thead>
            <tbody>
              <ContactRows contacts={query.data.items} showLender={!lenderId} canEdit={canEdit} onEdit={setEditing} />
            </tbody>
          </table>
        ) : (
          <p className="py-10 text-center text-[13px] text-muted">{filtered ? "Nobody matches that." : "No contacts yet."}</p>
        )}
      </div>
      <Pager page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
      {editing && (
        <ContactEditor contact={editing === "new" ? undefined : editing} lenders={lenders} lenderId={lenderId} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

/** One bank's people, opened from the lender page. */
export function LenderContactsModal({ lender, onClose }: { lender: { id: string; name: string }; onClose: () => void }) {
  return (
    <Modal title={`${lender.name} — people`} subtitle="Relationship managers and the lender's regional and branch contacts" onClose={onClose} maxWidth="max-w-6xl">
      <ContactBrowser lenders={[lender]} lenderId={lender.id} />
    </Modal>
  );
}

/** Everyone, across all banks — "who do I call at ICICI for a business loan?" */
export function PeopleDirectory({ lenders }: { lenders: { id: string; name: string }[] }) {
  return <ContactBrowser lenders={lenders} />;
}
