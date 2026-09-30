import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

/**
 * Archive / restore a finished file (Admin and Super Admin). Archiving only
 * hides it from the working list — it stays searchable and in every report.
 */
export function ArchiveButton({
  kind,
  id,
  archived,
  closed,
  refresh,
}: {
  kind: "leads" | "applications";
  id: string;
  archived: boolean;
  /** Whether the file is finished — open files can't be archived. */
  closed: boolean;
  refresh: string[][];
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api(`/${kind}/${id}/${archived ? "unarchive" : "archive"}`, { method: "POST" }),
    onSuccess: () => refresh.forEach((key) => void queryClient.invalidateQueries({ queryKey: key })),
  });

  if (!user || user.role === "ADVISOR") return null;
  if (!archived && !closed) return null;

  return (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      className="btn-ghost"
      title={archived ? "Put this back in the working list" : "Hide from the working list — it stays searchable and in reports"}
    >
      {toggle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      {archived ? "Restore" : "Archive"}
    </button>
  );
}

export function ArchivedBadge() {
  return (
    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
      Archived
    </span>
  );
}
