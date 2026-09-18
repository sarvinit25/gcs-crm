import { LogOut } from "lucide-react";
import { usePartnerAuth } from "../lib/partner-auth";

/**
 * Deliberately not the staff AppShell — a partner is an external referrer,
 * not internal staff, and should never see the CRM's own navigation or be
 * one misclick from a staff-only page.
 */
export function PartnerShell({ children }: { children: React.ReactNode }) {
  const { partner, logout } = usePartnerAuth();
  if (!partner) return null;

  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-navy">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-gold font-bold text-navy">
              G
            </span>
            <div className="leading-tight text-white">
              <p className="text-sm font-bold">Partner Portal</p>
              <p className="text-[11px] text-white/50">Growth Capital Services</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight text-white">
              <p className="text-[13px] font-semibold">{partner.name}</p>
              <p className="text-[11px] text-white/50">{partner.firm ?? partner.phone}</p>
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
      <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
    </div>
  );
}
