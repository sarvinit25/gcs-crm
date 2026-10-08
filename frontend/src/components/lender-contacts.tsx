import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { whatsappLink } from "../lib/customer-form";
import type { LenderContact } from "../lib/lender-contacts";
import { Modal } from "./modal";
import { TableSkeleton } from "./skeleton";

export const useContactSegments = () =>
  useQuery({ queryKey: ["lender-contact-segments"], queryFn: () => api<string[]>("/lender-contacts/segments"), staleTime: 5 * 60_000 });

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
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
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
          save.mutate({
            ...(contact ? {} : { lenderId: lenderId ?? text("lenderId") }),
            name: text("name"),
            designation: text("designation") || (contact ? null : undefined),
            phone: text("phone") || (contact ? null : undefined),
            email: text("email") || (contact ? null : undefined),
            notes: text("notes") || (contact ? null : undefined),
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
          <input name="designation" defaultValue={contact?.designation ?? "Sales Manager"} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Mobile
          <input name="phone" inputMode="tel" defaultValue={contact?.phone ?? ""} placeholder="10-digit number" className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Email
          <input name="email" type="email" defaultValue={contact?.email ?? ""} className="field mt-1.5 font-normal" />
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
    },
  });
}

function ContactRows({ contacts, showLender, canEdit, onEdit }: { contacts: LenderContact[]; showLender: boolean; canEdit: boolean; onEdit: (c: LenderContact) => void }) {
  const remove = useRemove();
  return (
    <>
      {contacts.map((c) => (
        <tr key={c.id} className={clsx("border-b border-line/70 align-top last:border-0", !c.active && "opacity-50")}>
          <td className="px-4 py-3">
            <p className="font-semibold text-navy">{c.name}</p>
            {c.designation && <p className="text-[12px] text-muted">{c.designation}</p>}
            {c.notes && (
              <p className="mt-1 flex items-start gap-1 text-[12px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span>{c.notes}</span>
              </p>
            )}
          </td>
          {showLender && <td className="px-4 py-3 text-ink">{c.lender.name}</td>}
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
      ))}
    </>
  );
}

const HEAD = "px-4 py-2.5 font-bold";

/** One bank's people, opened from the lender list. */
export function LenderContactsModal({ lender, onClose }: { lender: { id: string; name: string }; onClose: () => void }) {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [editing, setEditing] = useState<LenderContact | "new" | null>(null);
  const query = useQuery({
    queryKey: ["lender-contacts", { lenderId: lender.id }],
    queryFn: () => api<LenderContact[]>(`/lender-contacts?lenderId=${lender.id}&includeInactive=true`),
  });

  return (
    <>
      <Modal title={`${lender.name} — contacts`} subtitle="Relationship and sales managers who take our files" onClose={onClose} maxWidth="max-w-3xl">
        {canEdit && (
          <div className="mb-3 flex justify-end">
            <button className="btn-primary" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Add contact
            </button>
          </div>
        )}
        {query.isPending ? (
          <TableSkeleton />
        ) : query.data?.length ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr><th className={HEAD}>Person</th><th className={HEAD}>Contact</th><th className={HEAD}>Loan types</th><th className={HEAD} /></tr>
              </thead>
              <tbody>
                <ContactRows contacts={query.data} showLender={false} canEdit={canEdit} onEdit={setEditing} />
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">No contacts for this lender yet.</p>
        )}
      </Modal>
      {editing && (
        <ContactEditor contact={editing === "new" ? undefined : editing} lenders={[lender]} lenderId={lender.id} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

/** Everyone, across all banks — "who do I call at ICICI for a business loan?" */
export function PeopleDirectory({ lenders }: { lenders: { id: string; name: string }[] }) {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("");
  const [editing, setEditing] = useState<LenderContact | "new" | null>(null);
  const segments = useContactSegments();
  const query = useQuery({
    queryKey: ["lender-contacts", { search, segment }],
    queryFn: () => api<LenderContact[]>(`/lender-contacts?search=${encodeURIComponent(search)}&segment=${encodeURIComponent(segment)}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, number, email or bank" className="field w-72 pl-9" />
        </div>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className="field w-52" aria-label="Loan type">
          <option value="">All loan types</option>
          {(segments.data ?? []).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="text-[13px] text-muted">{query.data ? `${query.data.length} ${query.data.length === 1 ? "person" : "people"}` : ""}</span>
        {canEdit && (
          <button className="btn-primary ml-auto" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add contact
          </button>
        )}
      </div>
      <div className="card overflow-x-auto">
        {query.isPending ? (
          <TableSkeleton />
        ) : query.data?.length ? (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr><th className={HEAD}>Person</th><th className={HEAD}>Bank / NBFC</th><th className={HEAD}>Contact</th><th className={HEAD}>Loan types</th><th className={HEAD} /></tr>
            </thead>
            <tbody>
              <ContactRows contacts={query.data} showLender canEdit={canEdit} onEdit={setEditing} />
            </tbody>
          </table>
        ) : (
          <p className="py-10 text-center text-[13px] text-muted">Nobody matches that.</p>
        )}
      </div>
      {editing && <ContactEditor contact={editing === "new" ? undefined : editing} lenders={lenders} onClose={() => setEditing(null)} />}
    </>
  );
}
