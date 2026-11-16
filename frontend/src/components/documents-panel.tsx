import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, ScanText, Sparkles, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { api, tokenStore } from "../lib/api";
import { formatDateTime } from "../lib/format";

type Doc = {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
  /** Set when the customer uploaded it themselves through their application-form link. */
  inviteId?: string | null;
};

type Reading = {
  documentId: string;
  docType: string;
  method: "local" | "ai";
  summary: string | null;
  fields: { label: string; value: string }[];
  canAddToCam: boolean;
  addedToCamAt: string | null;
};

const DOC_TYPE: Record<string, string> = {
  SALARY_SLIP: "Salary slip", BANK_STATEMENT: "Bank statement", ITR: "Income tax return", FORM_16: "Form 16", GST_RETURN: "GST return",
  BUSINESS_PROOF: "Business proof", PROPERTY_PAPER: "Property paper", LOAN_STATEMENT: "Existing loan statement", IDENTITY_DOCUMENT: "Identity document", OTHER: "Other",
};

/** Identity papers are never read by the AI. */
const NEVER_READ = ["KYC"];

const CATEGORIES = [
  "KYC",
  "Income proof",
  "Bank statement",
  "Property papers",
  "Business proof",
  "Sanction letter",
  "Other",
];

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function DocumentsPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["documents", applicationId],
    queryFn: () => api<Doc[]>(`/applications/${applicationId}/documents`),
  });

  // Not the shared api() helper: multipart must not carry a JSON content-type,
  // or the boundary is lost and the upload arrives empty.
  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("category", category);

      const res = await fetch(`/crm/api/applications/${applicationId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenStore.get()}` },
        body,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          Array.isArray(json?.message) ? json.message.join(", ") : (json?.message ?? "Upload failed"),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["documents", applicationId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const download = async (doc: Doc) => {
    const { url } = await api<{ url: string }>(
      `/applications/${applicationId}/documents/${doc.id}/download`,
    );
    window.open(url, "_blank", "noopener");
  };

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/applications/${applicationId}/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", applicationId] }),
  });

  // What the reader found on each document (our own statement reader, or the AI), for staff to check.
  const readings = useQuery({
    queryKey: ["document-readings", applicationId],
    queryFn: () => api<{ aiEnabled: boolean; readings: Reading[] }>(`/applications/${applicationId}/document-readings`),
  });
  const found = new Map((readings.data?.readings ?? []).map((r) => [r.documentId, r]));
  const refreshReadings = () => void queryClient.invalidateQueries({ queryKey: ["document-readings", applicationId] });
  const [readingId, setReadingId] = useState<string | null>(null);
  const readOne = useMutation({
    mutationFn: (id: string) => {
      setReadingId(id);
      return api(`/applications/${applicationId}/document-readings/${id}/read`, { method: "POST" });
    },
    onSuccess: refreshReadings,
    onSettled: () => setReadingId(null),
  });
  const readAll = useMutation({
    mutationFn: () => api<{ read: number; failed: { fileName: string; error: string }[]; left: number }>(`/applications/${applicationId}/document-readings/read-all`, { method: "POST" }),
    onSuccess: refreshReadings,
  });
  const addToCam = useMutation({
    mutationFn: (id: string) => api(`/applications/${applicationId}/document-readings/${id}/add-to-cam`, { method: "POST" }),
    onSuccess: () => {
      refreshReadings();
      void queryClient.invalidateQueries({ queryKey: ["cam"] });
    },
  });

  // One tab per kind of document, so a long file stays easy to look through.
  const [tab, setTab] = useState<string>("All");
  const counts = new Map<string, number>();
  for (const d of query.data ?? []) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
  const shown = (query.data ?? []).filter((d) => tab === "All" || d.category === tab);
  const readable = (query.data ?? []).filter((d) => !NEVER_READ.includes(d.category) && !found.has(d.id)).length;
  const readError = (readOne.error ?? readAll.error ?? addToCam.error) as Error | null;

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">
          Documents <span className="text-muted">({query.data?.length ?? 0})</span>
        </h2>
        {readings.data?.aiEnabled && readable > 0 && (
          <button className="btn-ghost" disabled={readAll.isPending} onClick={() => readAll.mutate()} title="Reads the documents not yet read. Identity papers (KYC) are skipped.">
            {readAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Read all with AI ({readable})
          </button>
        )}
      </div>
      {readError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{readError.message}</p>}
      {readAll.data && (readAll.data.failed.length > 0 || readAll.data.left > 0) && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          Read {readAll.data.read}.{readAll.data.failed.length ? ` Could not read: ${readAll.data.failed.map((f) => `${f.fileName} (${f.error})`).join("; ")}.` : ""}{readAll.data.left ? ` ${readAll.data.left} more are left: press the button again.` : ""}
        </p>
      )}
      {(query.data?.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Document kinds">
          {["All", ...[...counts.keys()]].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={clsx("rounded-full border px-3 py-1 text-[12px] font-semibold", tab === t ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:bg-bg-light")}>
              {t} <span className={tab === t ? "text-white/70" : "text-muted"}>{t === "All" ? query.data?.length : counts.get(t)}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field w-44"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-primary"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-muted">PDF or image, up to 15MB.</p>

      <ul className="mt-4 space-y-2">
        {query.isPending && (
          <li className="flex items-center gap-2 text-[13px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </li>
        )}
        {query.data?.length === 0 && (
          <li className="text-[13px] text-muted">No documents uploaded yet.</li>
        )}
        {shown.map((doc) => {
          const r = found.get(doc.id);
          return (
          <li key={doc.id} className="rounded-lg border border-line p-3">
           <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 gap-2.5">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{doc.fileName}</p>
                <p className="text-[12px] text-muted">
                  {doc.category} · {formatSize(doc.sizeBytes)} ·{" "}
                  {doc.uploadedBy?.name ?? (doc.inviteId ? "Customer (online form)" : "Unknown")} · {formatDateTime(doc.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {readings.data?.aiEnabled && !NEVER_READ.includes(doc.category) && (
                <button onClick={() => readOne.mutate(doc.id)} disabled={readOne.isPending} title={r ? "Read again" : "Read this document"}
                  className="rounded p-1.5 text-muted transition hover:bg-bg-light hover:text-navy">
                  {readingId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                onClick={() => download(doc)}
                title="Download"
                className="rounded p-1.5 text-muted transition hover:bg-bg-light hover:text-navy"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove.mutate(doc.id)}
                title="Delete"
                className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
           </div>
           {r && (
            <div className="mt-2 rounded-md bg-bg-light p-3 text-[12px]">
              <p className="font-semibold text-navy">
                {DOC_TYPE[r.docType] ?? r.docType}
                <span className="ml-2 font-normal text-muted">{r.method === "local" ? "read on our own server" : "read by AI"}</span>
              </p>
              {r.summary && <p className="mt-0.5 text-muted">{r.summary}</p>}
              {r.fields.length > 0 && (
                <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {r.fields.map((f, i) => (
                    <div key={i} className="flex justify-between gap-2 border-b border-line/60 pb-0.5"><dt className="text-muted">{f.label}</dt><dd className="text-right font-semibold text-ink">{f.value}</dd></div>
                  ))}
                </dl>
              )}
              {r.canAddToCam && (
                <div className="mt-2 flex items-center gap-2">
                  <button className="btn-ghost" disabled={addToCam.isPending} onClick={() => addToCam.mutate(doc.id)}>
                    {addToCam.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add to CAM
                  </button>
                  <span className="text-muted">{r.addedToCamAt ? `Added ${formatDateTime(r.addedToCamAt)}. ` : ""}Check the figures first: they replace what is in those CAM boxes.</span>
                </div>
              )}
            </div>
           )}
          </li>
          );
        })}
      </ul>
    </section>
  );
}
