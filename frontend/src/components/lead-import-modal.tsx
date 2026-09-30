import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { Modal } from "./modal";

type Row = { name: string; phone: string; email?: string; city?: string; product?: string; amount?: number; notes?: string };
type Result = {
  created: number;
  duplicates: number;
  invalid: number;
  results: { row: number; name: string; status: "duplicate" | "invalid"; message?: string }[];
};

const HEADERS = ["name", "phone", "email", "city", "product", "amount", "notes"] as const;
const TEMPLATE = `${HEADERS.join(",")}\nAsha Patil,9876500001,asha@example.com,Pune,home-loan,4500000,Referred by existing client\n`;

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

function toRows(text: string): { rows: Row[]; error?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "The file has no data rows." };
  const header = table[0].map((h) => h.trim().toLowerCase());
  if (!header.includes("name") || !header.includes("phone")) {
    return { rows: [], error: 'The first row must include "name" and "phone" columns — download the template.' };
  }
  const col = (r: string[], key: string) => r[header.indexOf(key)]?.trim() || undefined;
  const rows = table.slice(1).map((r) => {
    const amount = col(r, "amount");
    return {
      name: col(r, "name") ?? "",
      phone: col(r, "phone") ?? "",
      email: col(r, "email"),
      city: col(r, "city"),
      product: col(r, "product"),
      amount: amount ? Number(amount.replace(/[,₹\s]/g, "")) : undefined,
      notes: col(r, "notes"),
    };
  });
  return { rows };
}

export function LeadImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => api<Result>("/leads/bulk", { method: "POST", body: JSON.stringify({ rows }) }),
    onSuccess: onDone,
  });

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gcs-leads-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const result = upload.data;

  return (
    <Modal title="Import leads" subtitle="Upload a CSV — up to 500 leads at a time" onClose={onClose} maxWidth="max-w-xl">
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
                        <td className={`px-3 py-2 ${r.status === "invalid" ? "text-red-600" : "text-amber-600"}`}>
                          {r.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <button onClick={onClose} className="btn-primary mt-4">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-muted">
            Columns: <span className="font-mono text-[12px]">{HEADERS.join(", ")}</span>. Only name and phone are
            required. <span className="font-mono text-[12px]">product</span> can be a loan product name or slug.
            Phones already in the CRM are skipped.
          </p>
          <button onClick={downloadTemplate} className="btn-ghost">
            <Download className="h-4 w-4" /> Download template
          </button>

          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-line px-4 py-6 text-center hover:bg-bg-light">
            <FileUp className="h-5 w-5 text-muted" />
            <span className="text-[13px] font-semibold text-navy">{fileName || "Choose a .csv file"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                const parsed = toRows(await file.text());
                setRows(parsed.rows);
                setParseError(parsed.error ?? null);
                upload.reset();
              }}
            />
          </label>

          {parseError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{parseError}</p>}
          {rows.length > 500 && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {rows.length} rows found — split the file into batches of 500.
            </p>
          )}
          {upload.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(upload.error as Error).message}</p>
          )}

          <button
            onClick={() => upload.mutate()}
            disabled={!rows.length || rows.length > 500 || upload.isPending}
            className="btn-primary"
          >
            {upload.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {rows.length ? `Import ${rows.length} lead${rows.length === 1 ? "" : "s"}` : "Import"}
          </button>
        </div>
      )}
    </Modal>
  );
}
