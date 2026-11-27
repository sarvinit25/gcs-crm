import { useMutation } from "@tanstack/react-query";
import { FileArchive, FileText, Loader2 } from "lucide-react";
import { tokenStore } from "../lib/api";

async function save(path: string, fallback: string) {
  const res = await fetch(`/crm/api${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? "Could not prepare the download");
  }
  const named = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = named ? decodeURIComponent(named) : fallback;
  a.click();
  // Give the browser a moment to start before the link is withdrawn.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The file's report as a PDF, or the report, CAM and every document together in one ZIP. */
export function FileDownload({ applicationId, applicationNo }: { applicationId: string; applicationNo: string }) {
  const report = useMutation({ mutationFn: () => save(`/applications/${applicationId}/report.pdf`, `${applicationNo} report.pdf`) });
  const pack = useMutation({ mutationFn: () => save(`/applications/${applicationId}/pack.zip`, `${applicationNo}.zip`) });
  const error = (pack.error ?? report.error) as Error | null;
  return (
    <section className="no-print card flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="text-[13px] font-bold text-navy">Download this file</p>
        <p className="mt-0.5 text-[12px] text-muted">The pack holds the process report, the CAM Excel and every document, in one ZIP.</p>
        {error && <p className="mt-1 text-[12px] font-medium text-red-700">{error.message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={report.isPending} onClick={() => report.mutate()}>
          {report.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Report (PDF)
        </button>
        <button type="button" className="btn-primary" disabled={pack.isPending} onClick={() => pack.mutate()}>
          {pack.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} {pack.isPending ? "Packing…" : "Full file (ZIP)"}
        </button>
      </div>
    </section>
  );
}
