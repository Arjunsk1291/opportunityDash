import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { DataProvider } from "@/contexts/DataContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { ApprovalProvider } from "@/contexts/ApprovalContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageLoader } from "@/components/PageLoader";
import Login from "./pages/Login";
import PendingApproval from "./pages/PendingApproval";
import NotFound from "./pages/NotFound";

// Every page is lazy-loaded so the initial bundle only carries the shell;
// route chunks download on demand (core routes prefetch on idle below).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const KpiDiagnostics = lazy(() => import("./pages/KpiDiagnostics"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const BidDecision = lazy(() => import("./pages/BidDecision"));
const PotentialOpportunities = lazy(() => import("./pages/PotentialOpportunities"));
const VendorDirectory = lazy(() => import("./pages/VendorDirectory"));
const Clients = lazy(() => import("./pages/Clients"));
const Analytics = lazy(() => import("./pages/Analytics"));
const BDEngagements = lazy(() => import("./pages/BDEngagements"));
const MasterOverviewRoute = lazy(() => import("./routes/master.overview"));
const MasterUsersRoute = lazy(() => import("./routes/master.users"));
const MasterPermissionsRoute = lazy(() => import("./routes/master.permissions"));
const MasterDataSyncRoute = lazy(() => import("./routes/master.data-sync"));
const MasterExportTemplatesRoute = lazy(() => import("./routes/master.export-templates"));
const MasterTelecastRoute = lazy(() => import("./routes/master.telecast"));
const MasterColumnsRoute = lazy(() => import("./routes/master.columns"));
const MasterDiagnosticsRoute = lazy(() => import("./routes/master.diagnostics"));
const PqActivities = lazy(() => import("./pages/PqActivities"));
const Upcoming = lazy(() => import("./pages/Upcoming"));

// Warm the most likely first destinations while the user is still on the
// login screen / auth check, so the first navigation feels instant.
const prefetchCoreRoutes = () => {
  void import("./pages/Dashboard");
  void import("./pages/Opportunities");
};
if (typeof window !== "undefined") {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(prefetchCoreRoutes);
  else window.setTimeout(prefetchCoreRoutes, 1200);
}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PageKey } from "@/config/navigation";
import { AuthProvider as SessionAuthProvider } from "@/contexts/AuthContext";
import { CssBaseline } from "@mui/material";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import { muiTheme } from "@/theme/muiTheme";
import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { Skeleton } from "@/components/ui/skeleton";
import { diag } from "@/lib/diagnostics";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppLayout() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}


function PageAccessRoute({ pageKey, children }: { pageKey: PageKey; children: React.ReactNode }) {
  const { canAccessPage } = useAuth();
  if (!canAccessPage(pageKey)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { isLoading, isPending, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md px-6">
          <Skeleton variant="rounded" height={48} className="w-40 mb-6" />
          <Skeleton variant="rounded" height={20} className="w-3/4 mb-3" />
          <Skeleton variant="rounded" height={20} className="w-2/3 mb-8" />
          <Skeleton variant="rounded" height={160} className="w-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      <RoutePerfLogger />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/kpi-diagnostics" element={<KpiDiagnostics />} />
        <Route
          path="/auth/callback"
          element={<Navigate to={isPending && isAuthenticated ? "/pending" : "/"} replace />}
        />

        {!isAuthenticated ? (
          <Route path="*" element={<Navigate to="/login" replace />} />
        ) : isPending && isAuthenticated ? (
          <>
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="*" element={<Navigate to="/pending" replace />} />
          </>
        ) : (
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PageAccessRoute pageKey="dashboard"><Dashboard /></PageAccessRoute>} />
            <Route path="opportunities" element={<PageAccessRoute pageKey="opportunities"><Opportunities /></PageAccessRoute>} />
            <Route path="bid-decision" element={<PageAccessRoute pageKey="bid_decision"><BidDecision /></PageAccessRoute>} />
            <Route path="tender-updates" element={<Navigate to="/potential-opportunities" replace />} />
            <Route path="potential-opportunities" element={<PageAccessRoute pageKey="tender_updates"><PotentialOpportunities /></PageAccessRoute>} />
            <Route path="pq-activities" element={<PageAccessRoute pageKey="pq_activities"><PqActivities /></PageAccessRoute>} />
            <Route path="tender-spreadsheet-v2" element={<Navigate to="/opportunities" replace />} />
            <Route path="vendors" element={<PageAccessRoute pageKey="vendor_directory"><VendorDirectory /></PageAccessRoute>} />
            <Route path="clients" element={<PageAccessRoute pageKey="clients"><Clients /></PageAccessRoute>} />
            <Route path="analytics" element={<PageAccessRoute pageKey="analytics"><Analytics /></PageAccessRoute>} />
            <Route path="bd-engagements" element={<PageAccessRoute pageKey="bd_engagements"><BDEngagements /></PageAccessRoute>} />
            <Route path="advanced-analytics" element={<Navigate to="/bd-engagements" replace />} />
            <Route path="master" element={<PageAccessRoute pageKey="master"><Navigate to="/master/overview" replace /></PageAccessRoute>} />
            <Route path="master/overview" element={<PageAccessRoute pageKey="master"><MasterOverviewRoute /></PageAccessRoute>} />
            <Route path="master/users" element={<PageAccessRoute pageKey="master"><MasterUsersRoute /></PageAccessRoute>} />
            <Route path="master/permissions" element={<PageAccessRoute pageKey="master"><MasterPermissionsRoute /></PageAccessRoute>} />
            <Route path="master/data-sync" element={<PageAccessRoute pageKey="master"><MasterDataSyncRoute /></PageAccessRoute>} />
            <Route path="master/export-templates" element={<PageAccessRoute pageKey="master"><MasterExportTemplatesRoute /></PageAccessRoute>} />
            <Route path="master/telecast" element={<PageAccessRoute pageKey="master"><MasterTelecastRoute /></PageAccessRoute>} />
            <Route path="master/columns" element={<PageAccessRoute pageKey="master"><MasterColumnsRoute /></PageAccessRoute>} />
            <Route path="master/diagnostics" element={<PageAccessRoute pageKey="master"><MasterDiagnosticsRoute /></PageAccessRoute>} />
            <Route path="upcoming" element={<PageAccessRoute pageKey="master"><Upcoming /></PageAccessRoute>} />

            <Route path="status/pre-bid" element={<Opportunities statusFilter="Pre-bid" />} />
            <Route path="status/in-progress" element={<Opportunities statusFilter="In Progress" />} />
            <Route path="status/submitted" element={<Opportunities statusFilter="Submitted" />} />
            <Route path="status/awarded" element={<Opportunities statusFilter="Awarded" />} />
            <Route path="status/lost" element={<Opportunities statusFilter="Lost/Regretted" />} />
            <Route path="status/on-hold" element={<Opportunities statusFilter="On Hold/Paused" />} />

            <Route path="my-pipeline" element={<Opportunities />} />
            <Route path="team" element={<Analytics />} />
            <Route path="at-risk" element={<Opportunities />} />

            <Route path="*" element={<NotFound />} />
          </Route>
        )}
      </Routes>
      </Suspense>
    </>
  );
}

function RoutePerfLogger() {
  const location = useLocation();

  React.useEffect(() => {
    const startedAt = performance.now();
    const path = location.pathname;
    diag.navStart(path);
    const onNextFrame = () => {
      const frameMs = Math.round(performance.now() - startedAt);
      diag.navPaint(path);
      if (diag.enabled) {

        console.log('[diag] hint: run `diagFinish()` in the browser console after the page finishes loading to print the full report.');
      }
    };
    const raf = window.requestAnimationFrame(onNextFrame);
    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname]);

  return null;
}

const MuiThemeProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();

  const currentMuiTheme = React.useMemo(() => {
    return {
      ...muiTheme,
      palette: {
        ...muiTheme.palette,
        mode: (resolvedTheme === "dark" ? "dark" : "light") as "light" | "dark",
      },
    };
  }, [resolvedTheme]);

  return (
    <ThemeProvider theme={currentMuiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <StyledEngineProvider injectFirst>
          <MuiThemeProviderWrapper>
            <SessionAuthProvider>
              <CurrencyProvider>
                <DataProvider>
                  <ApprovalProvider>
                    <TooltipProvider>
                      <Toaster />
                      <AppRoutes />
                    </TooltipProvider>
                  </ApprovalProvider>
                </DataProvider>
              </CurrencyProvider>
            </SessionAuthProvider>
          </MuiThemeProviderWrapper>
        </StyledEngineProvider>
      </NextThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
