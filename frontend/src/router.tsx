import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppShell } from "./components/app-shell";
import { PartnerShell } from "./components/partner-shell";
import { TrackShell } from "./components/track-shell";
import { useAuth } from "./lib/auth";
import { usePartnerAuth } from "./lib/partner-auth";
import { useBorrowerAuth } from "./lib/borrower-auth";
import { LoginPage } from "./routes/login";
import { PartnerLoginPage } from "./routes/partner-login";
import { PartnerDashboardPage } from "./routes/partner-dashboard";
import { TrackLoginPage } from "./routes/track-login";
import { TrackDashboardPage } from "./routes/track-dashboard";
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
import { CommissionsPage } from "./routes/commissions";
import { LendersPage } from "./routes/lenders";
import { AttendancePage } from "./routes/attendance";
import { ReportsPage } from "./routes/reports";
import { SettingsPage } from "./routes/settings";
import { SearchPage } from "./routes/search";

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

const partnerLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/partner-login",
  component: PartnerLoginPage,
});

/** Fully separate from the staff session — its own auth, its own shell. */
function PartnerProtectedLayout() {
  const { partner, ready } = usePartnerAuth();

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-navy" />
      </div>
    );
  }
  if (!partner) return <Navigate to="/partner-login" />;

  return (
    <PartnerShell>
      <Outlet />
    </PartnerShell>
  );
}

const partnerProtectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "partner-protected",
  component: PartnerProtectedLayout,
});

const trackLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/track-login",
  component: TrackLoginPage,
});

/** A borrower's own session — its own auth, its own shell, one application only. */
function TrackProtectedLayout() {
  const { borrower, ready } = useBorrowerAuth();

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-navy" />
      </div>
    );
  }
  if (!borrower) return <Navigate to="/track-login" />;

  return (
    <TrackShell>
      <Outlet />
    </TrackShell>
  );
}

const trackProtectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "track-protected",
  component: TrackProtectedLayout,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  partnerLoginRoute,
  trackLoginRoute,
  partnerProtectedRoute.addChildren([
    createRoute({
      getParentRoute: () => partnerProtectedRoute,
      path: "/partner",
      component: PartnerDashboardPage,
    }),
  ]),
  trackProtectedRoute.addChildren([
    createRoute({
      getParentRoute: () => trackProtectedRoute,
      path: "/track",
      component: TrackDashboardPage,
    }),
  ]),
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
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/commissions",
      component: CommissionsPage,
    }),
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
    createRoute({
      getParentRoute: () => protectedRoute,
      path: "/search",
      component: SearchPage,
      validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
    }),
  ]),
]);

export const router = createRouter({ routeTree, basepath: "/crm" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
