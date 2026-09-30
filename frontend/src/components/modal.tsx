import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Shared centered-overlay dialog. Fades and scales in; closing (X, backdrop or
 * Escape) plays a short exit before the parent unmounts it.
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
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 150);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4 ${closing ? "overlay-exit" : "overlay-enter"}`}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${maxWidth} max-h-[90vh] overflow-y-auto p-5 ${closing ? "dialog-exit" : "dialog-enter"}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-navy">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={close}
            className="rounded p-1 text-muted transition hover:bg-bg-light hover:text-navy"
            title="Close"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
