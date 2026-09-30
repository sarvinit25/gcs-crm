import { X } from "lucide-react";

/**
 * Shared centered-overlay dialog — same visual convention already used ad hoc
 * for a couple of edit dialogs (team/partners password resets), now with a
 * title/subtitle header and close button so every "add new" flow can use it.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`card w-full ${maxWidth} max-h-[90vh] overflow-y-auto p-5`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-navy">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition hover:bg-bg-light hover:text-navy"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
