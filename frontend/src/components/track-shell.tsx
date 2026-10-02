import { LogoMark } from "./logo";
import { LogOut } from "lucide-react";
import { useBorrowerAuth } from "../lib/borrower-auth";

/**
 * Deliberately not the staff AppShell or the PartnerShell — a borrower is
 * neither internal staff nor a referral partner, and should see nothing
 * beyond their own single file's status.
 */
export function TrackShell({ children }: { children: React.ReactNode }) {
  const { borrower, logout } = useBorrowerAuth();
  if (!borrower) return null;

  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-navy">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <LogoMark size="md" />
            <div className="leading-tight text-white">
              <p className="text-sm font-bold">Track Your Application</p>
              <p className="text-[11px] text-white/50">Growth Capital Services</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight text-white">
              <p className="text-[13px] font-semibold">{borrower.applicationNo}</p>
              <p className="text-[11px] text-white/50">{borrower.loanProduct}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="rounded p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-6">{children}</main>
    </div>
  );
}
