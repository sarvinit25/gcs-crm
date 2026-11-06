import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { api, tokenStore } from "../lib/api";
import { formatDateTime, humanize } from "../lib/format";

type LeadFile = { id: string; fileName: string; mimeType: string; sizeBytes: number; source: string; caption: string | null; createdAt: string };

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const from = (s: string) => (s === "whatsapp" ? "Sent on WhatsApp" : s === "staff" ? "Uploaded by team" : humanize(s));

/**
 * Everything the customer has sent, and anything the team uploads, on one lead. Files are kept in the private
 * storage bucket and opened through short-lived links.
 */
export function LeadDocuments({ leadId, files }: { leadId: string; files: LeadFile[] }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lead", leadId] });

  const upload = useMutation({
    mutationFn: async (picked: File[]) => {
      for (const file of picked) {
        const body = new FormData();
        body.append("file", file);
        if (note.trim()) body.append("caption", note.trim());
        // a plain fetch: api() always sends JSON, and a file needs the browser's own multipart header
        const res = await fetch(`/crm/api/leads/${leadId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get()}` }, body });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error((Array.isArray(err?.message) ? err.message.join(", ") : err?.message) ?? "Upload failed");
        }
      }
    },
    onSuccess: () => {
      setNote("");
      if (input.current) input.current.value = "";
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/leads/${leadId}/files/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const open = async (f: LeadFile) => {
    const { url } = await api<{ url: string }>(`/leads/${leadId}/files/${f.id}/download`);
    window.open(url, "_blank", "noopener");
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy">Documents</h2>
          <p className="text-[12px] text-muted">PDF, JPG, PNG, WebP or HEIC, up to 15 MB each. Kept safely and visible only to people who can see this lead.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Label (optional), e.g. Salary slip" className="field w-52 font-normal" aria-label="Label for the upload" />
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*"
            className="hidden"
            onChange={(e) => e.target.files?.length && upload.mutate([...e.target.files])}
          />
          <button type="button" className="btn-primary" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </button>
        </div>
      </div>

      {(upload.isError || remove.isError) && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{((upload.error ?? remove.error) as Error).message}</p>
      )}

      {files.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">No documents yet. Files the customer sends on WhatsApp land here too.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-navy">{f.fileName}</p>
                <p className="text-[11px] text-muted">
                  {from(f.source)} · {size(f.sizeBytes)} · {formatDateTime(f.createdAt)}
                  {f.caption ? ` · “${f.caption}”` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="btn-ghost inline-flex items-center gap-1.5 text-[12px]" onClick={() => open(f)}>
                  <Download size={13} /> Download
                </button>
                <button
                  type="button"
                  className="btn-ghost text-red-600"
                  aria-label={`Delete ${f.fileName}`}
                  disabled={remove.isPending}
                  onClick={() => window.confirm(`Delete ${f.fileName}? This cannot be undone.`) && remove.mutate(f.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
