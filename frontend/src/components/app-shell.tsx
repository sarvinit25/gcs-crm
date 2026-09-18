import { Link, useRouterState } from "@tanstack/react-router";
import {
  BadgeIndianRupee,
  Banknote,
  BarChart3,
  Building2,
  CalendarCheck,
  FileText,
  History,
  Handshake,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  UserSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/types";

type NavItem = { to: string; label: string; icon: LucideIcon; roles?: Role[] };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Pipeline",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/leads", label: "Leads", icon: Users },
      { to: "/applications", label: "Applications", icon: FileText },
      { to: "/sanctions", label: "Sanctions", icon: ShieldCheck },
      { to: "/disbursements", label: "Disbursements", icon: Banknote },
      {
        to: "/commissions",
        label: "Commissions",
        icon: BadgeIndianRupee,
        roles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    section: "Directory",
    items: [
      { to: "/lenders", label: "Lender Directory", icon: Building2 },
      { to: "/partners", label: "Sourcing Partners", icon: Handshake, roles: ["ADMIN", "MANAGER"] },
      { to: "/team", label: "Team", icon: UserSquare, roles: ["ADMIN"] },
    ],
  },
  {
    section: "Operations",
    items: [
      {
        to: "/attendance",
        label: "Attendance & Payroll",
        icon: CalendarCheck,
        roles: ["ADMIN", "MANAGER"],
      },
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/audit", label: "Audit log", icon: History, roles: ["ADMIN"] },
      { to: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] },
    ],
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-navy text-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gold font-bold text-navy">
            G
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">GCS</p>
            <p className="text-[11px] text-white/50">Back office</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.roles || i.roles.includes(user.role));
            if (!items.length) return null;

            return (
              <div key={group.section} className="mb-5">
                <p className="px-2 pb-1.5 text-[10px] font-bold tracking-[0.14em] text-white/35 uppercase">
                  {group.section}
                </p>
                {items.map((item) => {
                  const active =
                    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={clsx(
                        "mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium transition",
                        active
                          ? "bg-white/10 text-white"
                          : "text-white/65 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <item.icon className={clsx("h-4 w-4", active && "text-gold")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold">{user.name}</p>
              <p className="text-[11px] text-white/45 capitalize">{user.role.toLowerCase()}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="rounded p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 lg:pl-60">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg-light/85 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-navy">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}
