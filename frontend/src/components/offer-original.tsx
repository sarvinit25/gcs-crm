import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { tokenStore } from "../lib/api";

/**
 * The original flyer, shown beside what was read from it, so every figure can be checked against the real thing.
 * Pictures and PDFs show right here; a pasted message shows as text; Word and Excel files cannot be drawn in a browser,
 * so they offer a download instead.
 */
export function OfferOriginal({ id, fileName, mimeType, hasFile, rawText }: { id: string; fileName: string | null; mimeType: string | null; hasFile: boolean; rawText: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showable = hasFile && (mimeType?.startsWith("image/") || mimeType === "application/pdf");

  useEffect(() => {
    if (!hasFile) return;
    let made: string | null = null;
    let cancelled = false;
    fetch(`/crm/api/lender-offers/${id}/file/content`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("The original could not be opened");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, hasFile]);

  const frame = "overflow-auto rounded-lg border border-line bg-bg-light";
  if (rawText && !hasFile) {
    return (
      <div className={frame}>
        <p className="border-b border-line bg-white px-3 py-2 text-[12px] font-bold text-navy">The pasted message</p>
        <pre className="max-h-[68vh] overflow-auto p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-ink">{rawText}</pre>
      </div>
    );
  }
  if (!hasFile) return <p className="rounded-lg bg-bg-light px-3 py-6 text-center text-[13px] text-muted">The original was not kept for this reading.</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-6 text-center text-[13px] text-red-700">{error}</p>;
  if (!url) return <div className="grid place-items-center rounded-lg bg-bg-light py-16"><Loader2 className="h-5 w-5 animate-spin text-navy" /></div>;

  return (
    <div className={frame}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <p className="min-w-0 truncate text-[12px] font-bold text-navy">{fileName ?? "The original"}</p>
        <a href={url} download={fileName ?? "flyer"} className="btn-ghost shrink-0 !py-1 text-[12px]"><Download size={13} /> Download</a>
      </div>
      {showable && mimeType === "application/pdf" ? (
        <iframe title="The original PDF" src={url} className="h-[68vh] w-full bg-white" />
      ) : showable ? (
        <div className="max-h-[68vh] overflow-auto bg-white"><img src={url} alt="The original flyer" className="mx-auto block h-auto max-w-full" /></div>
      ) : (
        <div className="grid place-items-center gap-2 px-4 py-14 text-center text-[13px] text-muted">
          <FileText className="h-8 w-8 text-muted" />
          <p>Word and Excel files cannot be shown in the browser. Download it to compare.</p>
        </div>
      )}
    </div>
  );
}
