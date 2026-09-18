import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppShell } from "./components/app-shell";
import { useAuth } from "./lib/auth";
import { LoginPage } from "./routes/login";
import { DashboardPage } from "./routes/dashboard";
import { LeadsPage } from "./routes/leads";
import { LeadDetailPage } from "./routes/lead-detail";
import { ApplicationsPage } from "./routes/applications";
import { ApplicationDetailPage } from "./routes/application-detail";
import { SanctionsPage } from "./routes/sanctions";
import { TeamPage } from "./routes/team";
import { AuditPage } from "./routes/audit";
import { DisbursementsPage } from "./routes/disbursements";
import { PartnersPage } from "./routes/partners";
import { LendersPage } from "./routes/lenders";
import { AttendancePage } from "./routes/attendance";
import { ReportsPage } from "./routes/reports";
import { SettingsPage } from "./routes/settings";
import { PlaceholderPage } from "./routes/placeholder";

function RootLayout() {
  return <Outlet />;
}

const rootRoute = createRootRoute({ component: RootLayout });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

/** Everything under here needs a session; unauthenticated users bounce to /login. */
function ProtectedLayout() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-navy" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  component: ProtectedLayout,
});

const placeholder = (path: string, title: string, description: string) =>
  createRoute({
    getParentRoute: () => protectedRoute,
    path,
    component: () => <PlaceholderPage title={title} description={description} />,
  });

const routeTree = rootRoute.addChildren([
  loginRoute,
  protectedRoute.addChildren([
    createRoute({ getParentRoute: () => protectedRoute, path: "/", component: DashboardPage }),
    createRoute({ getParentRoute: () => protectedRoute, path: "/leads", component: LeadsPage }),
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/leads/$leadId",
      component: LeadDetailPage,
    }),
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/applications",
      component: ApplicationsPage,
    }),
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/applications/$applicationId",
      component: ApplicationDetailPage,
    }),
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/sanctions",
      component: SanctionsPage,
    }),
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/disbursements",
      component: DisbursementsPage,
    }),
    placeholder(
      "/commissions",
      "Commissions",
      "Commission ledger per disbursed case, split across every stakeholder, with payout status.",
    ),
    createRoute({ getParentRoute: () => protectedRoute, path: "/lenders", component: LendersPage }),
    createRoute({ getParentRoute: () => protectedRoute, path: "/partners", component: PartnersPage }),
    createRoute({ getParentRoute: () => protectedRoute, path: "/team", component: TeamPage }),
    createRoute({ getParentRoute: () => protectedRoute, path: "/audit", component: AuditPage }),
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/attendance",
      component: AttendancePage,
    }),
    createRoute({ getParentRoute: () => protectedRoute, path: "/reports", component: ReportsPage }),
    createRoute({ getParentRoute: () => protectedRoute, path: "/settings", component: SettingsPage }),
  ]),
]);

export const router = createRouter({ routeTree, basepath: "/crm" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
