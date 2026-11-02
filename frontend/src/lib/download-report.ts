import { qs, tokenStore } from "./api";
import { todayIST } from "./date";

export type ReportType = "leads" | "applications" | "sanctions" | "disbursements" | "commissions";

/**
 * Downloads a formatted report (company letterhead, filters, summary, totals).
 * `filters` are the same ones the on-screen list used, so the file always matches what the user was looking at;
 * add `columns` (comma-separated keys) or `templateId` for a custom export. Every matching record is included.
 */
export async function downloadReport(
  type: ReportType,
  filters: Record<string, string | number | undefined> = {},
  format: "xlsx" | "csv" = "xlsx",
) {
  const res = await fetch(`/crm/api/reports/records/export${qs({ type, format, ...filters })}`, {
    headers: { Authorization: `Bearer ${tokenStore.get()}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message ?? "Could not build the report");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `gcs-${type}-report-${todayIST()}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
