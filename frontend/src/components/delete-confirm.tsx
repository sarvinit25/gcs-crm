import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Modal } from "./modal";

/**
 * "Are you sure?" for a deletion that cannot be undone. Cancel is the easy way out; the red button says plainly that the
 * delete is permanent. If the server refuses (for example a lead that already has a loan file) its reason is shown here
 * and nothing is deleted.
 */
export function DeleteConfirm({
  title,
  confirmLabel = "Delete permanently",
  onDelete,
  onDone,
  onClose,
  children,
}: {
  title: string;
  confirmLabel?: string;
  /** Does the deletion; reject with an Error to show its message. */
  onDelete: () => Promise<unknown>;
  /** Runs once the deletion has worked, before the dialog closes. */
  onDone: () => void;
  onClose: () => void;
  /** What will be lost, and any extra option such as a tick-box. */
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await onDelete();
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Could not delete. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={() => !busy && onClose()}>
      <div className="flex items-start gap-3 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="font-semibold">This is permanent and cannot be undone.</p>
      </div>
      <div className="mt-3 space-y-3 text-[13px] text-ink">{children}</div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={busy} autoFocus>
          Cancel
        </button>
        <button
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
