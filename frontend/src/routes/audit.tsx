import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {  } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatDateTime, humanizeKey } from "../lib/format";
import type { Paginated } from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { TableSkeleton } from "../components/skeleton";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN";

type AuditEntry = {
  id: string;
  actorName: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  entityLabel: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  ip: string | null;
  createdAt: string;
};

const ACTION_TONE: Record<AuditAction, string> = {
  CREATE: "bg-emerald-50 text-emerald-700",
  UPDATE: "bg-sky-50 text-sky-700",
  DELETE: "bg-red-50 text-red-700",
  LOGIN: "bg-slate-100 text-slate-600",
};

const ENTITIES = ["Lead", "Application", "Sanction", "Disbursement", "Document", "User"];

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

export function AuditPage() {
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["audit", { entity, page }],
    queryFn: () => api<Paginated<AuditEntry>>(`/audit${qs({ entity, page })}`),
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={
          query.data ? `${query.data.total} recorded actions` : "Who changed what, and when"
        }
      />

      <div className="px-6 py-5">
        <select
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
          className="field mb-4 w-52"
        >
          <option value="">All record types</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">
              {(query.error as Error).message}
            </p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">When</th>
                  <th className="px-4 py-2.5 font-bold">Who</th>
                  <th className="px-4 py-2.5 font-bold">Action</th>
                  <th className="px-4 py-2.5 font-bold">Record</th>
                  <th className="px-4 py-2.5 font-bold">Changes</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((e) => (
                  <tr key={e.id} className="border-b border-line/70 align-top last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDateTime(e.createdAt)}
                      {e.ip && <p className="text-[11px]">{e.ip}</p>}
                    </td>
                    <td className="px-4 py-3 font-medium">{e.actorName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
                          ACTION_TONE[e.action],
                        )}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">{e.entityLabel ?? e.entityId}</p>
                      <p className="text-[12px] text-muted">{humanizeKey(e.entity)}</p>
                    </td>
                    <td className="wrap px-4 py-3">
                      {e.changes ? (
                        <ul className="space-y-0.5">
                          {Object.entries(e.changes).map(([field, { from, to }]) => (
                            <li key={field} className="text-[12px]">
                              <span className="font-semibold text-navy">{humanizeKey(field)}</span>{" "}
                              <span className="text-muted line-through">{show(from)}</span>{" "}
                              <span className="text-muted">→</span>{" "}
                              <span className="text-emerald-700">{show(to)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {query.data && query.data.total > query.data.pageSize && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>
              Page {query.data.page} of {Math.ceil(query.data.total / query.data.pageSize)}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-ghost"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-ghost"
                disabled={page >= Math.ceil(query.data.total / query.data.pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
