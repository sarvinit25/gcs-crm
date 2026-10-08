import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

type Faq = { q: string; a: string };
type Fact = { label: string; value: string };
type ProductText = {
  title?: string;
  tagline: string;
  about: string;
  features: string[];
  eligibility: string[];
  documents: string[];
  facts: Fact[];
};
type CaseStudy = {
  slug: string;
  group: string;
  category: string;
  headline: string;
  amountLabel: string;
  productSlug: string;
  productLabel: string;
  clientProfile: string;
  challenge: string;
  structuring: string;
  outcome: string;
  visible: boolean;
};
type ServiceText = {
  division?: string;
  title: string;
  summary: string;
  whoNeedsIt: string;
  process: string[];
  documents: string[];
};
type SiteInfo = {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  reportPrice: number;
  upiId: string;
  upiName: string;
};
type Content = {
  faqs?: Record<string, Faq[]>;
  products?: Record<string, ProductText>;
  caseStudies?: CaseStudy[];
  services?: Record<string, ServiceText>;
  siteInfo?: SiteInfo;
  pageText?: PageTextMap;
};
type PageTextMap = Record<string, Record<string, string>>;
type Section = "pageText" | "siteInfo" | "faqs" | "products" | "services" | "caseStudies";
type Saved = { key: string; value: unknown; updatedAt: string; updatedByName: string | null };

const SECTIONS: { id: Section; label: string; help: string }[] = [
  {
    id: "pageText",
    label: "Page wording",
    help: "Wording changed straight on the website (sign in here, open any page, press Edit text). Review or undo those changes here.",
  },
  {
    id: "siteInfo",
    label: "Contact & CIBIL",
    help: "Phone, WhatsApp, email, address and hours shown across the site, plus the credit report price and the UPI ID the payment QR uses.",
  },
  { id: "faqs", label: "FAQs", help: "Questions and answers on the Contact, Partner and city pages." },
  {
    id: "products",
    label: "Loan product pages",
    help: "The description, features, eligibility and documents on each loan page.",
  },
  {
    id: "services",
    label: "CA & legal services",
    help: "The summary, who needs it, process steps and documents on each CA and legal service page.",
  },
  {
    id: "caseStudies",
    label: "Case studies",
    help: "The success stories on the Case studies page. Hide one to take it off the site.",
  },
];

const FAQ_PAGES: Record<string, string> = {
  contact: "Contact page",
  partner: "Partner page",
  mumbai: "Mumbai page",
  thane: "Thane page",
  "navi-mumbai": "Navi Mumbai page",
  pune: "Pune page",
};

const GROUPS = ["Home & Property", "Business & Cash Flow", "Personal Goals"];

const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Admin-only editor for the text on the public website. Until staff save a section, the website
 * shows the copy built into it; saving here replaces it, and "Reset" brings the built-in copy back.
 */
export function WebsiteContent() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("pageText");

  const saved = useQuery({
    queryKey: ["site-content"],
    queryFn: () => api<Saved[]>("/settings/site-content"),
  });
  const defaults = useQuery({
    queryKey: ["site-content-defaults"],
    queryFn: () => api<Content>("/settings/site-content/defaults"),
  });

  const savedByKey = useMemo(() => {
    const m = new Map<string, Saved>();
    for (const s of saved.data ?? []) m.set(s.key, s);
    return m;
  }, [saved.data]);

  const save = useMutation({
    mutationFn: ({ key, value }: { key: Section; value: unknown }) =>
      api(`/settings/site-content/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["site-content"] }),
  });
  const reset = useMutation({
    mutationFn: (key: Section) => api(`/settings/site-content/${key}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["site-content"] }),
  });

  if (saved.isPending || defaults.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  const error = [saved, defaults, save, reset].find((q) => q.isError)?.error;
  const current = SECTIONS.find((s) => s.id === section)!;
  const row = savedByKey.get(section);
  const builtIn = defaults.data?.[section] ?? {};
  // Saved products/FAQs only hold the pages staff changed, so lay them over the built-in copy.
  const initial = !row
    ? builtIn
    : Array.isArray(row.value)
      ? row.value
      : { ...(builtIn as object), ...(row.value as object) };

  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">
        The text visitors read on the website. Changes go live as soon as you save. Sections you
        have not changed keep the copy built into the website.
      </p>
      <div className="mb-4 flex flex-wrap gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={clsx(
              "rounded-md px-3 py-1.5 text-[13px] font-semibold",
              section === s.id
                ? "bg-navy text-white"
                : "border border-line bg-white text-muted hover:text-navy",
            )}
          >
            {s.label}
            {savedByKey.has(s.id) && <span className="ml-1.5 text-[10px] text-gold">● edited</span>}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[12px] text-muted">
        {current.help}
        {row && (
          <>
            {" "}
            Last saved {new Date(row.updatedAt).toLocaleString("en-IN")}
            {row.updatedByName ? ` by ${row.updatedByName}` : ""}.
          </>
        )}
      </p>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {(error as Error).message}
        </p>
      )}

      <HistoryPanel
        section={section}
        savedAt={row?.updatedAt}
        onRestored={() => queryClient.invalidateQueries({ queryKey: ["site-content"] })}
      />

      <Editor
        key={`${section}:${row?.updatedAt ?? "built-in"}`}
        section={section}
        initial={initial}
        builtIn={builtIn}
        busy={save.isPending || reset.isPending}
        canReset={!!row}
        onSave={(value) => save.mutate({ key: section, value })}
        onReset={() => reset.mutate(section)}
      />
    </div>
  );
}

type EditorProps = {
  section: Section;
  initial: unknown;
  builtIn: unknown;
  busy: boolean;
  canReset: boolean;
  onSave: (value: unknown) => void;
  onReset: () => void;
};

function Editor({ section, initial, builtIn, busy, canReset, onSave, onReset }: EditorProps) {
  const [draft, setDraft] = useState<unknown>(initial);
  const dirty = !same(draft, initial);

  // Only changed pages/products are stored, so untouched ones keep following the website's copy.
  const toSave = () => {
    if (section === "caseStudies") return draft;
    const d = draft as Record<string, unknown>;
    const b = builtIn as Record<string, unknown>;
    return Object.fromEntries(Object.entries(d).filter(([k, v]) => !same(v, b[k])));
  };

  return (
    <div>
      {section === "pageText" && (
        <PageTextEditor value={draft as PageTextMap} onChange={setDraft} />
      )}
      {section === "siteInfo" && (
        <SiteInfoEditor value={draft as SiteInfo} onChange={setDraft} />
      )}
      {section === "services" && (
        <ServiceEditor value={draft as Record<string, ServiceText>} onChange={setDraft} />
      )}
      {section === "faqs" && (
        <FaqEditor value={draft as Record<string, Faq[]>} onChange={setDraft} />
      )}
      {section === "products" && (
        <ProductEditor value={draft as Record<string, ProductText>} onChange={setDraft} />
      )}
      {section === "caseStudies" && (
        <CaseStudyEditor value={draft as CaseStudy[]} onChange={setDraft} />
      )}

      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <button
          onClick={() => onSave(toSave())}
          disabled={busy || !dirty}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save and publish
        </button>
        {canReset && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Go back to the copy built into the website? Your edits to this section will be lost.",
                )
              ) {
                onReset();
              }
            }}
            disabled={busy}
            className="btn-ghost"
          >
            <RotateCcw className="h-4 w-4" /> Reset to built-in
          </button>
        )}
        {dirty && <span className="text-[12px] text-muted">Unsaved changes</span>}
      </div>
    </div>
  );
}

function FaqEditor({
  value,
  onChange,
}: {
  value: Record<string, Faq[]>;
  onChange: (v: unknown) => void;
}) {
  const [page, setPage] = useState(Object.keys(FAQ_PAGES)[0]!);
  const list = value[page] ?? [];
  const set = (next: Faq[]) => onChange({ ...value, [page]: next });
  return (
    <div>
      <select
        value={page}
        onChange={(e) => setPage(e.target.value)}
        className="field mb-3 max-w-xs"
      >
        {Object.entries(FAQ_PAGES).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <div className="space-y-3">
        {list.map((f, i) => (
          <div key={i} className="rounded-lg border border-line p-3">
            <div className="flex gap-2">
              <input
                value={f.q}
                onChange={(e) =>
                  set(list.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))
                }
                placeholder="Question"
                className="field flex-1 font-semibold"
              />
              <button
                onClick={() => set(list.filter((_, j) => j !== i))}
                className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={f.a}
              onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
              placeholder="Answer"
              rows={3}
              className="field mt-2 w-full"
            />
          </div>
        ))}
      </div>
      <button onClick={() => set([...list, { q: "", a: "" }])} className="btn-ghost mt-3">
        <Plus className="h-4 w-4" /> Add question
      </button>
    </div>
  );
}

function LinesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  // Switching product loads a different list; typing keeps the raw text so blank lines survive.
  useEffect(() => {
    setText((t) => (same(lines(t), value) ? t : value.join("\n")));
  }, [value]);
  return (
    <label className="block">
      <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
        {label} — one per line
      </span>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
        rows={Math.min(10, Math.max(3, value.length + 1))}
        className="field mt-1 w-full"
      />
    </label>
  );
}

function ProductEditor({
  value,
  onChange,
}: {
  value: Record<string, ProductText>;
  onChange: (v: unknown) => void;
}) {
  const slugs = Object.keys(value);
  const [slug, setSlug] = useState(slugs[0] ?? "");
  const p = value[slug];
  if (!p) return <p className="text-sm text-muted">No loan products found.</p>;
  const patch = (next: Partial<ProductText>) => onChange({ ...value, [slug]: { ...p, ...next } });
  return (
    <div className="space-y-3">
      <select value={slug} onChange={(e) => setSlug(e.target.value)} className="field max-w-sm">
        {slugs.map((s) => (
          <option key={s} value={s}>
            {value[s]?.title ?? s}
          </option>
        ))}
      </select>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Tagline</span>
        <input
          value={p.tagline}
          onChange={(e) => patch({ tagline: e.target.value })}
          className="field mt-1 w-full"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">About</span>
        <textarea
          value={p.about}
          onChange={(e) => patch({ about: e.target.value })}
          rows={4}
          className="field mt-1 w-full"
        />
      </label>
      <LinesField label="Features" value={p.features} onChange={(features) => patch({ features })} />
      <LinesField
        label="Eligibility"
        value={p.eligibility}
        onChange={(eligibility) => patch({ eligibility })}
      />
      <LinesField
        label="Documents"
        value={p.documents}
        onChange={(documents) => patch({ documents })}
      />
      <div>
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Key facts (shown as small cards)
        </span>
        <div className="mt-1 space-y-2">
          {p.facts.map((f, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={f.label}
                onChange={(e) =>
                  patch({ facts: p.facts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                }
                placeholder="Label"
                className="field w-1/3"
              />
              <input
                value={f.value}
                onChange={(e) =>
                  patch({ facts: p.facts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
                }
                placeholder="Value"
                className="field flex-1"
              />
              <button
                onClick={() => patch({ facts: p.facts.filter((_, j) => j !== i) })}
                className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => patch({ facts: [...p.facts, { label: "", value: "" }] })}
          className="btn-ghost mt-2"
        >
          <Plus className="h-4 w-4" /> Add fact
        </button>
      </div>
    </div>
  );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function CaseStudyEditor({
  value,
  onChange,
}: {
  value: CaseStudy[];
  onChange: (v: unknown) => void;
}) {
  const [index, setIndex] = useState(0);
  const c = value[index];
  const patch = (next: Partial<CaseStudy>) =>
    onChange(value.map((x, i) => (i === index ? { ...x, ...next } : x)));
  const text = (key: keyof CaseStudy, label: string, rows?: number) =>
    c && (
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</span>
        {rows ? (
          <textarea
            value={String(c[key] ?? "")}
            onChange={(e) => patch({ [key]: e.target.value })}
            rows={rows}
            className="field mt-1 w-full"
          />
        ) : (
          <input
            value={String(c[key] ?? "")}
            onChange={(e) => patch({ [key]: e.target.value })}
            className="field mt-1 w-full"
          />
        )}
      </label>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="field max-w-md"
        >
          {value.map((s, i) => (
            <option key={`${s.slug}-${i}`} value={i}>
              {s.visible === false ? "(hidden) " : ""}
              {s.headline || s.slug || "New case study"}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            onChange([
              ...value,
              {
                slug: "",
                group: GROUPS[0]!,
                category: "",
                headline: "",
                amountLabel: "",
                productSlug: value[0]?.productSlug ?? "",
                productLabel: "",
                clientProfile: "",
                challenge: "",
                structuring: "",
                outcome: "",
                visible: true,
              },
            ]);
            setIndex(value.length);
          }}
          className="btn-ghost"
        >
          <Plus className="h-4 w-4" /> Add case study
        </button>
        {c && (
          <button
            onClick={() => {
              if (window.confirm("Delete this case study?")) {
                onChange(value.filter((_, i) => i !== index));
                setIndex(0);
              }
            }}
            className="btn-ghost text-red-600"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
      {c && (
        <>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-navy">
            <input
              type="checkbox"
              checked={c.visible !== false}
              onChange={(e) => patch({ visible: e.target.checked })}
            />
            Show on the website
          </label>
          {text("headline", "Headline")}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Group</span>
              <select
                value={c.group}
                onChange={(e) => patch({ group: e.target.value })}
                className="field mt-1 w-full"
              >
                {GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            {text("category", "Category")}
            {text("amountLabel", "Amount")}
            {text("productLabel", "Loan product name")}
            {text("productSlug", "Loan product link (website slug, e.g. home-loan)")}
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Page address (slug)
              </span>
              <input
                value={c.slug}
                onChange={(e) => patch({ slug: slugify(e.target.value) })}
                onBlur={() => !c.slug && c.headline && patch({ slug: slugify(c.headline) })}
                className="field mt-1 w-full"
              />
            </label>
          </div>
          {text("clientProfile", "Client profile", 3)}
          {text("challenge", "Challenge", 3)}
          {text("structuring", "How we structured it", 3)}
          {text("outcome", "Outcome", 3)}
        </>
      )}
    </div>
  );
}

const INFO_FIELDS: { key: keyof SiteInfo; label: string; hint?: string }[] = [
  { key: "phone", label: "Primary phone", hint: "As shown, e.g. +91 88280 01700" },
  { key: "whatsapp", label: "WhatsApp number", hint: "Digits with country code, e.g. 918828001700" },
  { key: "email", label: "Email" },
  { key: "address", label: "Office address" },
  { key: "hours", label: "Working hours", hint: "e.g. Monday to Saturday · 10:00 AM – 6:00 PM" },
  { key: "reportPrice", label: "Credit report price (₹)", hint: "One flat price for every bureau" },
  { key: "upiId", label: "UPI ID for the payment QR", hint: "e.g. growthcapital@okhdfcbank — leave empty until you have it" },
  { key: "upiName", label: "Name shown on the UPI payment" },
];

function SiteInfoEditor({ value, onChange }: { value: SiteInfo; onChange: (v: unknown) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {INFO_FIELDS.map((f) => (
        <label key={f.key} className={f.key === "address" ? "block sm:col-span-2" : "block"}>
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{f.label}</span>
          <input
            value={String(value[f.key] ?? "")}
            inputMode={f.key === "reportPrice" ? "numeric" : undefined}
            onChange={(e) =>
              onChange({
                ...value,
                [f.key]: f.key === "reportPrice" ? Number(e.target.value.replace(/\D/g, "")) : e.target.value,
              })
            }
            className="field mt-1 w-full"
          />
          {f.hint && <span className="mt-0.5 block text-[11px] text-muted">{f.hint}</span>}
        </label>
      ))}
      <p className="text-[12px] text-muted sm:col-span-2">
        The extra phone numbers are set under Settings → Organisation → Additional phone numbers.
      </p>
    </div>
  );
}

function ServiceEditor({
  value,
  onChange,
}: {
  value: Record<string, ServiceText>;
  onChange: (v: unknown) => void;
}) {
  const slugs = Object.keys(value);
  const [slug, setSlug] = useState(slugs[0] ?? "");
  const p = value[slug];
  if (!p) return <p className="text-sm text-muted">No services found.</p>;
  const patch = (next: Partial<ServiceText>) => onChange({ ...value, [slug]: { ...p, ...next } });
  return (
    <div className="space-y-3">
      <select value={slug} onChange={(e) => setSlug(e.target.value)} className="field max-w-md">
        {slugs.map((s) => (
          <option key={s} value={s}>
            {value[s]?.title ?? s}
          </option>
        ))}
      </select>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Title</span>
        <input value={p.title} onChange={(e) => patch({ title: e.target.value })} className="field mt-1 w-full" />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Summary</span>
        <textarea value={p.summary} onChange={(e) => patch({ summary: e.target.value })} rows={3} className="field mt-1 w-full" />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Who needs it</span>
        <textarea value={p.whoNeedsIt} onChange={(e) => patch({ whoNeedsIt: e.target.value })} rows={3} className="field mt-1 w-full" />
      </label>
      <LinesField label="Process steps" value={p.process} onChange={(process) => patch({ process })} />
      <LinesField label="Documents" value={p.documents} onChange={(documents) => patch({ documents })} />
    </div>
  );
}

function PageTextEditor({ value, onChange }: { value: PageTextMap; onChange: (v: unknown) => void }) {
  const pages = Object.keys(value);
  if (pages.length === 0) {
    return (
      <p className="rounded-lg bg-bg-light p-4 text-[13px] text-muted">
        Nothing changed yet. To edit wording: sign in here as an admin, open the website page you
        want to change, press <strong>Edit text</strong> (bottom-left), click the wording and save.
      </p>
    );
  }
  const setEdit = (page: string, from: string, to: string | null) => {
    const edits = { ...value[page] };
    if (to === null) delete edits[from];
    else edits[from] = to;
    const next = { ...value, [page]: edits };
    if (Object.keys(edits).length === 0) delete next[page];
    onChange(next);
  };
  return (
    <div className="space-y-5">
      {pages.map((page) => (
        <div key={page}>
          <p className="mb-2 text-[12px] font-bold tracking-wide text-navy uppercase">
            {page === "*" ? "Every page" : page}
          </p>
          <div className="space-y-2">
            {Object.entries(value[page] ?? {}).map(([from, to]) => (
              <div key={from} className="rounded-lg border border-line p-3">
                <p className="text-[12px] text-muted line-through">{from}</p>
                <div className="mt-1 flex gap-2">
                  <textarea
                    value={to}
                    onChange={(e) => setEdit(page, from, e.target.value)}
                    rows={2}
                    className="field flex-1"
                  />
                  <button
                    onClick={() => setEdit(page, from, null)}
                    className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
                    title="Undo this change"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Version = { id: string; savedAt: string; savedByName: string | null; reset: boolean; size: number };

/** Past saves of this section. Restoring one puts that wording back live (and is itself recorded). */
function HistoryPanel({
  section,
  savedAt,
  onRestored,
}: {
  section: string;
  savedAt: string | undefined;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ["site-content-history", section, savedAt],
    queryFn: () => api<Version[]>(`/settings/site-content/${section}/history`),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (id: string) =>
      api(`/settings/site-content/${section}/restore/${id}`, { method: "POST" }),
    onSuccess: () => {
      onRestored();
      setOpen(false);
    },
  });
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(!open)} className="btn-ghost">
        <History className="h-4 w-4" /> {open ? "Hide history" : "History / undo"}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
          {history.isPending ? (
            <p className="p-3 text-[13px] text-muted">Loading…</p>
          ) : (history.data ?? []).length === 0 ? (
            <p className="p-3 text-[13px] text-muted">No saved changes yet.</p>
          ) : (
            <ul className="divide-y divide-line/70 text-[13px]">
              {history.data!.map((v, i) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-semibold text-navy">
                      {new Date(v.savedAt).toLocaleString("en-IN")}
                    </span>
                    <span className="text-muted">
                      {" "}
                      · {v.savedByName ?? "Unknown"} · {v.reset ? "reset to built-in" : "saved"}
                      {i === 0 ? " · current" : ""}
                    </span>
                  </span>
                  {i > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm("Put this version back? It goes live straight away.")) {
                          restore.mutate(v.id);
                        }
                      }}
                      disabled={restore.isPending}
                      className="text-[12px] font-semibold text-gold-dark hover:underline"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {restore.isError && (
            <p className="p-3 text-[13px] text-red-700">{(restore.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  );
}
