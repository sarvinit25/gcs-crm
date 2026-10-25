import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Info, Loader2, Upload } from "lucide-react";
import { ApiError, tokenStore } from "../lib/api";
import { Modal } from "./modal";

type Result = {
  created: number;
  duplicates: number;
  invalid: number;
  results: { row: number; name: string; status: "duplicate" | "invalid"; message?: string }[];
};

/** The server reads the file, so a spreadsheet and a CSV take the same road. */
async function sendFile(file: File): Promise<Result> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/crm/api/leads/import", { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get()}` }, body });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (Array.isArray(json?.message) ? json.message.join(", ") : json?.message) ?? "The file could not be imported");
  return json as Result;
}

async function downloadTemplate() {
  const res = await fetch("/crm/api/leads/import-template", { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new Error("Could not build the template");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "gcs-leads-import-template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

export function LeadImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: () => sendFile(file!),
    onSuccess: onDone,
  });
  const result = upload.data;

  return (
    <Modal title="Import leads from Excel" onClose={onClose} maxWidth="max-w-lg">
      {result ? (
        <div>
          <p className="flex items-center gap-2 text-[14px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {result.created} lead{result.created === 1 ? "" : "s"} imported
          </p>
          {(result.duplicates > 0 || result.invalid > 0) && (
            <>
              <p className="mt-2 text-[13px] text-muted">
                {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped · {result.invalid} row
                {result.invalid === 1 ? " needs" : "s need"} fixing
              </p>
              <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-line">
                <table className="w-full text-left text-[12px]">
                  <tbody>
                    {result.results.map((r) => (
                      <tr key={r.row} className="border-b border-line/70 last:border-0">
                        <td className="px-3 py-2 text-muted">Row {r.row + 1}</td>
                        <td className="px-3 py-2 font-semibold text-navy">{r.name}</td>
                        <td className={`px-3 py-2 ${r.status === "invalid" ? "text-red-600" : "text-amber-600"}`}>{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="btn-primary">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-[13px] text-sky-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <button
                type="button"
                onClick={() => downloadTemplate().then(() => setTemplateError(null), (e: Error) => setTemplateError(e.message))}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
              >
                <Download className="h-3.5 w-3.5" /> Download import template
              </button>{" "}
              — fill in your leads and upload the file below. Name and phone are required; up to 500 leads at a time; phone numbers already in the CRM are skipped.
            </p>
          </div>
          {templateError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{templateError}</p>}

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-navy">Select Excel file (.xlsx) or CSV</p>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-3 py-2 text-[13px] hover:bg-bg-light">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-bg-light px-3 py-1 font-semibold text-navy">
                <FileSpreadsheet className="h-4 w-4" /> Choose file
              </span>
              <span className="truncate text-muted">{file?.name ?? "No file chosen"}</span>
              <input
                ref={input}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  upload.reset();
                }}
              />
            </label>
          </div>

          {upload.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(upload.error as Error).message}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button onClick={() => upload.mutate()} disabled={!file || upload.isPending} className="btn-primary">
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
