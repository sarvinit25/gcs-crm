import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
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
};

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

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">
          Documents <span className="text-muted">({query.data?.length ?? 0})</span>
        </h2>
      </div>

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
        {query.data?.map((doc) => (
          <li
            key={doc.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-line p-3"
          >
            <div className="flex min-w-0 gap-2.5">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{doc.fileName}</p>
                <p className="text-[12px] text-muted">
                  {doc.category} · {formatSize(doc.sizeBytes)} ·{" "}
                  {doc.uploadedBy?.name ?? "Unknown"} · {formatDateTime(doc.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
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
          </li>
        ))}
      </ul>
    </section>
  );
}
