import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, Plus, ScanText, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { api, tokenStore } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { OfferOriginal } from "../components/offer-original";

type Kind = "LENDER_OFFER" | "SERVICE_PROVIDER" | "OTHER";
type Contact = { name: string | null; designation: string | null; phone: string | null; email: string | null };
type Terms = {
  scheme: string | null; productSlug: string | null;
  minAmount: number | null; maxAmount: number | null; minRate: number | null; maxRate: number | null;
  minTenureMonths: number | null; maxTenureMonths: number | null; rateType: "FLOATING" | "FIXED" | null;
  processingFee: string | null; employmentTypes: string[]; gstRequired: boolean | null; minCreditScore: number | null;
  allIndia: boolean | null; cities: string[]; ltv: string | null; documents: string[]; charges: string | null; turnaround: string | null; notes: string | null;
};
type Extraction = { kind: Kind; summary: string; lenderName: string | null; lenderType: "BANK" | "NBFC" | null; website: string | null; contacts: Contact[]; offers: Terms[]; validTill?: string | null };
type Row = { id: string; source: string; fileName: string | null; kind: Kind; summary: string | null; status: string; createdAt: string; createdByName: string | null; lenderName: string | null; offerCount: number };
type Detail = Row & {
  extracted: Extraction; hasFile: boolean; rawText: string | null; mimeType: string | null; lenderMatch: { id: string; name: string } | null;
  preview: { productSlug: string; productName: string; exists: boolean; schemes: number; changes: string[] }[]; skipped: number; sheetFound?: string[];
  lenders: { id: string; name: string }[]; products: { slug: string; name: string }[];
  appliedSummary: Applied | null; duplicate?: boolean;
};
type Applied = {
  lender: { name: string; isNew: boolean }; created: string[]; updated: string[]; unchanged: string[];
  changes: { product: string; items: string[] }[]; contactsAdded: number; contactsUpdated: number; lenderFilled: string[]; skippedProducts: number;
  sheetFilled?: string[]; sheetDiffers?: { label: string; held: string; flyer: string }[];
};

const KIND_LABEL: Record<Kind, { text: string; tone: string }> = {
  LENDER_OFFER: { text: "Lender offer", tone: "bg-emerald-50 text-emerald-700" },
  SERVICE_PROVIDER: { text: "Service provider, not a lender", tone: "bg-amber-50 text-amber-800" },
  OTHER: { text: "Not relevant", tone: "bg-slate-100 text-slate-600" },
};
const BLANK_TERMS: Terms = {
  scheme: null, productSlug: null, minAmount: null, maxAmount: null, minRate: null, maxRate: null, minTenureMonths: null, maxTenureMonths: null,
  rateType: null, processingFee: null, employmentTypes: [], gstRequired: null, minCreditScore: null, allIndia: null, cities: [], ltv: null,
  documents: [], charges: null, turnaround: null, notes: null,
};
const FIELD = "field font-normal";
const LABEL = "grid gap-1 text-[12px] font-semibold text-navy";

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

function TermsEditor({ t, products, onChange, onRemove }: { t: Terms; products: Detail["products"]; onChange: (t: Terms) => void; onRemove: () => void }) {
  const set = <K extends keyof Terms>(k: K, v: Terms[K]) => onChange({ ...t, [k]: v });
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-navy">{t.scheme || "Product"}</p>
        <button type="button" onClick={onRemove} className="btn-ghost text-red-600" aria-label="Remove this product"><Trash2 size={14} /></button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className={LABEL}>Name on the flyer<input className={FIELD} value={t.scheme ?? ""} onChange={(e) => set("scheme", e.target.value || null)} /></label>
        <label className={clsx(LABEL, "sm:col-span-2")}>Our loan type
          <select className={FIELD} value={t.productSlug ?? ""} onChange={(e) => set("productSlug", e.target.value || null)}>
            <option value="">Not one of ours (will be skipped)</option>
            {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
        <label className={LABEL}>Amount from (₹)<input className={FIELD} type="number" min={0} value={t.minAmount ?? ""} onChange={(e) => set("minAmount", numOrNull(e.target.value))} /></label>
        <label className={LABEL}>Amount up to (₹)<input className={FIELD} type="number" min={0} value={t.maxAmount ?? ""} onChange={(e) => set("maxAmount", numOrNull(e.target.value))} /></label>
        <label className={LABEL}>Rate type
          <select className={FIELD} value={t.rateType ?? ""} onChange={(e) => set("rateType", (e.target.value || null) as Terms["rateType"])}>
            <option value="">Not stated</option><option value="FIXED">Fixed</option><option value="FLOATING">Floating</option>
          </select>
        </label>
        <label className={LABEL}>Rate from (% a year)<input className={FIELD} type="number" step="0.01" min={0} max={100} value={t.minRate ?? ""} onChange={(e) => set("minRate", numOrNull(e.target.value))} /></label>
        <label className={LABEL}>Rate up to (% a year)<input className={FIELD} type="number" step="0.01" min={0} max={100} value={t.maxRate ?? ""} onChange={(e) => set("maxRate", numOrNull(e.target.value))} /></label>
        <label className={LABEL}>Processing fee<input className={FIELD} value={t.processingFee ?? ""} onChange={(e) => set("processingFee", e.target.value || null)} /></label>
        <label className={LABEL}>Tenure from (months)<input className={FIELD} type="number" min={1} value={t.minTenureMonths ?? ""} onChange={(e) => set("minTenureMonths", numOrNull(e.target.value))} /></label>
        <label className={LABEL}>Tenure up to (months)<input className={FIELD} type="number" min={1} value={t.maxTenureMonths ?? ""} onChange={(e) => set("maxTenureMonths", numOrNull(e.target.value))} /></label>
        <label className={LABEL}>GST needed
          <select className={FIELD} value={t.gstRequired === null ? "" : String(t.gstRequired)} onChange={(e) => set("gstRequired", e.target.value === "" ? null : e.target.value === "true")}>
            <option value="">Not stated</option><option value="true">Yes</option><option value="false">No</option>
          </select>
        </label>
        <label className={LABEL}>Who can apply<input className={FIELD} placeholder="Salaried, Self-employed" value={t.employmentTypes.join(", ")} onChange={(e) => set("employmentTypes", csv(e.target.value))} /></label>
        <label className={LABEL}>Cities<input className={FIELD} placeholder="Mumbai, Pune" value={t.cities.join(", ")} onChange={(e) => set("cities", csv(e.target.value))} /></label>
        <label className={LABEL}>All India
          <select className={FIELD} value={t.allIndia === null ? "" : String(t.allIndia)} onChange={(e) => set("allIndia", e.target.value === "" ? null : e.target.value === "true")}>
            <option value="">Not stated</option><option value="true">Yes</option><option value="false">No</option>
          </select>
        </label>
        <label className={LABEL}>Charges<input className={FIELD} value={t.charges ?? ""} onChange={(e) => set("charges", e.target.value || null)} /></label>
        <label className={LABEL}>Turnaround<input className={FIELD} value={t.turnaround ?? ""} onChange={(e) => set("turnaround", e.target.value || null)} /></label>
        <label className={clsx(LABEL, "sm:col-span-3")}>Documents asked for<input className={FIELD} placeholder="Separate with commas" value={t.documents.join(", ")} onChange={(e) => set("documents", csv(e.target.value))} /></label>
        <label className={clsx(LABEL, "sm:col-span-3")}>Notes<textarea className={clsx(FIELD, "min-h-[56px] resize-none")} value={t.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></label>
      </div>
    </div>
  );
}

export function ReviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["lender-offer", id], queryFn: () => api<Detail>(`/lender-offers/${id}`) });
  const [draft, setDraft] = useState<Extraction | null>(null);
  const [lenderId, setLenderId] = useState<string | null>(null); // null = follow the suggested match / new name
  const [done, setDone] = useState<Applied | null>(null);

  const data = q.data;
  // A reading that was added already (by you earlier, or automatically on upload) shows what it changed.
  const result = done ?? (data?.status === "APPLIED" ? data.appliedSummary : null);
  const x = draft ?? data?.extracted;
  const matchId = lenderId ?? data?.lenderMatch?.id ?? "";
  const editable = data?.status === "DRAFT";
  const touch = (patch: Partial<Extraction>) => x && setDraft({ ...x, ...patch });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["lender-offers"] }); void queryClient.invalidateQueries({ queryKey: ["lender-offer", id] }); };

  const save = useMutation({
    mutationFn: () => api<Detail>(`/lender-offers/${id}`, { method: "PATCH", body: JSON.stringify(draft) }),
    onSuccess: (d) => { queryClient.setQueryData(["lender-offer", id], d); setDraft(null); refresh(); },
  });
  const apply = useMutation({
    mutationFn: async () => {
      if (draft) await api(`/lender-offers/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
      return api<Applied>(`/lender-offers/${id}/apply`, { method: "POST", body: JSON.stringify(matchId ? { lenderId: matchId } : { newLenderName: x?.lenderName ?? "" }) });
    },
    onSuccess: (r) => { setDone(r); setDraft(null); refresh(); void queryClient.invalidateQueries({ queryKey: ["lender-policies"] }); },
  });
  const discard = useMutation({ mutationFn: () => api(`/lender-offers/${id}/discard`, { method: "POST" }), onSuccess: () => { refresh(); onClose(); } });
  // the original flyer sits beside the reading so every figure can be checked against it
  const showOriginal = Boolean(data && (data.hasFile || data.rawText));

  return (
    <Modal title={result ? "What was added" : "Review what was read"} subtitle={result ? "This is what this reading added to the lender. Nothing was copied twice." : "Check every figure against the flyer. This one waits: nothing is added to Lender match until you press the button."} onClose={onClose} maxWidth={showOriginal ? "max-w-7xl" : "max-w-3xl"}>
      {!data || !x ? (
        <div className="py-10 text-center text-muted"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : (
        <div className={clsx("grid gap-5", showOriginal && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]")}>
          {showOriginal && (
            <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
              <p className="mb-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">The original it was read from</p>
              <OfferOriginal id={id} fileName={data.fileName} mimeType={data.mimeType} hasFile={data.hasFile} rawText={data.rawText} />
            </div>
          )}
          <div className="min-w-0">
      {result ? (
        <div className="grid gap-3 text-[13px]">
          <p className="flex items-center gap-2 text-base font-bold text-emerald-700"><Check className="h-5 w-5" /> Added to {result.lender.name}{result.lender.isNew ? " (new lender)" : ""}</p>
          {result.created.length > 0 && <p>New policies: <strong>{result.created.join(", ")}</strong></p>}
          {result.changes.map((c) => (
            <div key={c.product} className="rounded-md bg-bg-light px-3 py-2">
              <p><strong>{c.product}</strong> already existed, so this was added to it:</p>
              <ul className="mt-1 list-disc pl-5 text-muted">{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
          {result.unchanged.length > 0 && <p className="text-muted">Nothing new for <strong>{result.unchanged.join(", ")}</strong>: the lender already had all of this.</p>}
          {(result.contactsAdded > 0 || result.contactsUpdated > 0) && (
            <p>
              {result.contactsAdded > 0 && <>{result.contactsAdded} new contact{result.contactsAdded === 1 ? "" : "s"} added. </>}
              {result.contactsUpdated > 0 && <>{result.contactsUpdated} existing contact{result.contactsUpdated === 1 ? "" : "s"} filled in, not copied.</>}
            </p>
          )}
          {result.lenderFilled.length > 0 && <p>Added to the lender's details: <strong>{result.lenderFilled.join(", ")}</strong>.</p>}
          {(result.sheetFilled?.length ?? 0) > 0 && <p>Policy one-pager: <strong>{result.sheetFilled!.length} detail{result.sheetFilled!.length === 1 ? "" : "s"} filled</strong> ({result.sheetFilled!.slice(0, 8).join(", ")}{result.sheetFilled!.length > 8 ? " and more" : ""}).</p>}
          {(result.sheetDiffers?.length ?? 0) > 0 && <p className="text-amber-800">The flyer says something different for {result.sheetDiffers!.map((d) => `${d.label} (held: ${d.held}, flyer: ${d.flyer})`).join("; ")}. Nothing already held was changed.</p>}
          {(result.created.length > 0 || result.changes.length > 0) && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">These are marked <strong>not yet verified</strong>. Lender match sends them to a person until you check them against the lender and press Verify on the policy.</p>
          )}
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <div className="grid gap-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold", KIND_LABEL[x.kind].tone)}>{KIND_LABEL[x.kind].text}</span>
            {editable && (
              <select className={clsx(FIELD, "ml-auto w-auto")} value={x.kind} onChange={(e) => touch({ kind: e.target.value as Kind })} aria-label="What kind of page is this">
                <option value="LENDER_OFFER">Lender offer</option><option value="SERVICE_PROVIDER">Service provider</option><option value="OTHER">Not relevant</option>
              </select>
            )}
          </div>
          <p className="text-muted">{x.summary || "No summary."}</p>
          {x.validTill && (
            <p className={x.validTill < new Date().toISOString().slice(0, 10) ? "font-semibold text-amber-700" : "text-muted"}>
              {x.validTill < new Date().toISOString().slice(0, 10) ? `This offer ended on ${x.validTill}, so it was not added automatically. Check with the lender before using it.` : `Valid till ${x.validTill}.`}
            </p>
          )}

          {x.kind !== "LENDER_OFFER" ? (
            <p className="rounded-md bg-bg-light px-3 py-2.5 text-muted">
              This is not a lender's loan offer, so there is nothing to add to Lender match. {x.contacts.length > 0 ? "The contact details it shows are listed below." : ""} If it really is a lender, change the kind above.
            </p>
          ) : (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className={LABEL}>Lender in the CRM
                  <select className={FIELD} disabled={!editable} value={matchId} onChange={(e) => setLenderId(e.target.value)}>
                    <option value="">New lender (named below)</option>
                    {data.lenders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label className={LABEL}>Name on the flyer<input className={FIELD} disabled={!editable} value={x.lenderName ?? ""} placeholder="Lender's name" onChange={(e) => touch({ lenderName: e.target.value || null })} /></label>
              </div>
              {!matchId && <p className="-mt-2 text-[12px] text-muted">A new lender is created for our own use only. It will not appear on the website.</p>}

              <div className="grid gap-3">
                {x.offers.map((t, i) => (
                  <TermsEditor key={i} t={t} products={data.products}
                    onChange={(n) => touch({ offers: x.offers.map((o, j) => (j === i ? n : o)) })}
                    onRemove={() => touch({ offers: x.offers.filter((_, j) => j !== i) })} />
                ))}
                {editable && <button type="button" className="btn-ghost justify-self-start" onClick={() => touch({ offers: [...x.offers, { ...BLANK_TERMS }] })}><Plus size={14} /> Add a product</button>}
              </div>
            </>
          )}

          {x.contacts.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">People to call</p>
              <ul className="divide-y divide-line rounded-md border border-line">
                {x.contacts.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span><strong className="text-navy">{c.name ?? "Contact"}</strong>{c.designation ? ` · ${c.designation}` : ""}<br /><span className="text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</span></span>
                    {editable && <button type="button" className="btn-ghost text-red-600" aria-label="Remove contact" onClick={() => touch({ contacts: x.contacts.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {x.kind === "LENDER_OFFER" && data.preview.length > 0 && !draft && (
            <div className="grid gap-2 text-muted">
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="data-table">
                  <thead>
                    <tr><th>Loan type</th><th>What happens</th><th>What changes</th></tr>
                  </thead>
                  <tbody>
                    {data.preview.map((p) => (
                      <tr key={p.productSlug}>
                        <td className="font-semibold whitespace-nowrap text-navy">{p.productName}</td>
                        <td className="whitespace-nowrap">{p.exists ? "Added to the existing policy" : "A new policy"}{p.schemes > 1 ? ` (${p.schemes} schemes combined)` : ""}</td>
                        <td className="wrap">{p.exists ? (p.changes.length ? p.changes.join("; ") : "Nothing new: the lender already has all of this.") : "The figures from the flyer"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(data.sheetFound?.length ?? 0) > 0 ? <p>Policy one-pager details found: <strong>{data.sheetFound!.length}</strong> ({data.sheetFound!.slice(0, 8).join(", ")}{data.sheetFound!.length > 8 ? " and more" : ""}). They fill the lender's one-pager; anything already there is kept.</p> : null}
              {data.skipped > 0 ? <p>{data.skipped} product{data.skipped === 1 ? "" : "s"} without a loan type will be skipped.</p> : null}
            </div>
          )}
          {(save.isError || apply.isError || discard.isError) && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">{((save.error ?? apply.error ?? discard.error) as Error).message}</p>}

          {editable ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost text-red-600" disabled={discard.isPending} onClick={() => window.confirm("Throw this reading away?") && discard.mutate()}>Discard</button>
              {draft && <button type="button" className="btn-ghost" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes</button>}
              {x.kind === "LENDER_OFFER" && (
                <button type="button" className="btn-primary" disabled={apply.isPending || (!matchId && !(x.lenderName ?? "").trim())} onClick={() => apply.mutate()}>
                  {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Add to Lender match
                </button>
              )}
            </div>
          ) : (
            <p className="text-muted">This reading was {data.status === "APPLIED" ? "added to Lender match" : "discarded"}.</p>
          )}
        </div>
      )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function LenderOffersPage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["lender-offers"], queryFn: () => api<Row[]>("/lender-offers") });
  const [notice, setNotice] = useState("");

  const read = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      if (text.trim()) body.append("text", text.trim());
      // a plain fetch: api() always sends JSON, and files need the browser's own multipart header
      const res = await fetch("/crm/api/lender-offers", { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get()}` }, body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(Array.isArray(json?.message) ? json.message.join(", ") : (json?.message ?? "Could not read that"));
      return json as Detail[];
    },
    onSuccess: (made) => {
      setFiles([]); setText("");
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["lender-offers"] });
      void queryClient.invalidateQueries({ queryKey: ["lender-policies"] });
      const repeats = made.filter((m) => m.duplicate);
      setNotice(repeats.length ? `${repeats.length === 1 ? "That was" : `${repeats.length} of those were`} already read before, so nothing was added twice.` : "");
      if (made.length === 1) setOpen(made[0]!.id);
    },
  });

  return (
    <>
      <PageHeader title="Lender offers" subtitle="Drop in a lender's flyer or paste their message. It is read for you and added to the lender: a lender already in the CRM is updated straight away, a new one waits for you to check it. The same thing put in twice is never added twice." />
      <div className="grid gap-4 px-4 py-4 lg:px-6">
        <section className="card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-navy">Pictures, PDF, Word or Excel files</p>
              <input ref={fileInput} type="file" multiple className="hidden" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
              <button type="button" onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setFiles([...e.dataTransfer.files]); }}
                className="mt-2 grid w-full place-items-center rounded-lg border-2 border-dashed border-line px-4 py-8 text-center text-[13px] text-muted transition hover:border-navy/40">
                <Upload className="mb-1.5 h-5 w-5 text-navy" />
                {files.length ? <span className="font-semibold text-navy">{files.map((f) => f.name).join(", ")}</span> : <span>Click to choose, or drop files here.<br />PDF, Word (.docx), Excel (.xlsx), JPG, PNG or WebP. Up to 20 files.</span>}
              </button>
            </div>
            <label className="grid text-sm font-bold text-navy">Or paste the message
              <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} placeholder="Paste a WhatsApp message from a lender or DSA here" className="field mt-2 min-h-[8.5rem] resize-none font-normal" />
            </label>
          </div>
          {read.isError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(read.error as Error).message}</p>}
          {notice && !read.isPending && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{notice}</p>}
          <div className="mt-4 flex items-center justify-end gap-3">
            {read.isPending && <span className="text-[12px] text-muted">Reading. This takes about 10 seconds for each file.</span>}
            <button type="button" className="btn-primary" disabled={read.isPending || (!files.length && !text.trim())} onClick={() => read.mutate()}>
              {read.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Read it
            </button>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3 text-sm font-bold text-navy">Recent readings</div>
          {!list.data?.length ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Nothing read yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table clickable">
                <thead>
                  <tr><th>Lender / file</th><th>What it says</th><th>Products</th><th>Kind</th><th>Status</th><th>Read</th><th>By</th></tr>
                </thead>
                <tbody>
                  {list.data.map((r) => (
                    <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(r.id))}>
                      <td className="min-w-48">
                        <span className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted" /><span className="font-semibold text-navy">{r.lenderName ?? "Lender not named"}</span></span>
                        <span className="block max-w-64 truncate pl-6 text-[11px] text-muted" title={r.fileName ?? undefined}>{r.fileName ?? "Pasted message"}</span>
                      </td>
                      <td className="wrap max-w-md text-muted"><span className="line-clamp-2">{r.summary ?? "—"}</span></td>
                      <td className="num whitespace-nowrap">{r.offerCount || "—"}</td>
                      <td className="whitespace-nowrap"><span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", KIND_LABEL[r.kind].tone)}>{KIND_LABEL[r.kind].text}</span></td>
                      <td className="whitespace-nowrap"><span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", r.status === "APPLIED" ? "bg-navy/10 text-navy" : "bg-gold-pale text-gold-dark")}>{r.status === "APPLIED" ? "Added" : "To review"}</span></td>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</td>
                      <td className="whitespace-nowrap text-muted">{r.createdByName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
