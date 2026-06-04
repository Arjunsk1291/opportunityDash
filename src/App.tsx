import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { DataProvider } from "@/contexts/DataContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { ApprovalProvider } from "@/contexts/ApprovalContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import KpiDiagnostics from "./pages/KpiDiagnostics";
import Login from "./pages/Login";
import Opportunities from "./pages/Opportunities";
import PotentialOpportunities from "./pages/PotentialOpportunities";
import VendorDirectory from "./pages/VendorDirectory";
import Clients from "./pages/Clients";
import Analytics from "./pages/Analytics";
import BDEngagements from "./pages/BDEngagements";
import AdvancedAnalytics from "./pages/AdvancedAnalytics";
import Admin from "./pages/Admin";
import PendingApproval from "./pages/PendingApproval";
import NotFound from "./pages/NotFound";
import TenderSpreadsheetV2 from "./pages/TenderSpreadsheetV2";
import PqActivities from "./pages/PqActivities";
import HireFlow from "./pages/HireFlow";
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

const queryClient = new QueryClient();

function AppLayout() {
  return (
    <Layout>
      <Outlet />
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
            <Route path="tender-updates" element={<Navigate to="/potential-opportunities" replace />} />
            <Route path="potential-opportunities" element={<PageAccessRoute pageKey="tender_updates"><PotentialOpportunities /></PageAccessRoute>} />
            <Route path="pq-activities" element={<PageAccessRoute pageKey="pq_activities"><PqActivities /></PageAccessRoute>} />
            <Route path="tender-spreadsheet-v2" element={<PageAccessRoute pageKey="opportunities"><TenderSpreadsheetV2 /></PageAccessRoute>} />
            <Route path="vendors" element={<PageAccessRoute pageKey="vendor_directory"><VendorDirectory /></PageAccessRoute>} />
            <Route path="clients" element={<PageAccessRoute pageKey="clients"><Clients /></PageAccessRoute>} />
            <Route path="analytics" element={<PageAccessRoute pageKey="analytics"><Analytics /></PageAccessRoute>} />
            <Route path="bd-engagements" element={<PageAccessRoute pageKey="bd_engagements"><BDEngagements /></PageAccessRoute>} />
            <Route path="advanced-analytics" element={<PageAccessRoute pageKey="advanced_analytics"><AdvancedAnalytics /></PageAccessRoute>} />
            <Route path="master" element={<PageAccessRoute pageKey="master"><Admin /></PageAccessRoute>} />
            <Route path="hireflow" element={<PageAccessRoute pageKey="master"><HireFlow /></PageAccessRoute>} />

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
