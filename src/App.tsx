import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { DataProvider } from "@/contexts/DataContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ApprovalProvider } from "@/contexts/ApprovalContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Opportunities from "./pages/Opportunities";
import Clients from "./pages/Clients";
import Analytics from "./pages/Analytics";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import PendingApproval from "./pages/PendingApproval";
import NotFound from "./pages/NotFound";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PageKey } from "@/config/navigation";

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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/auth/callback"
          element={<Navigate to={isPending && isAuthenticated ? "/pending" : "/"} replace />}
        />
        <Route path="/login" element={<Login />} />

        {isPending && isAuthenticated ? (
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
            <Route path="clients" element={<PageAccessRoute pageKey="clients"><Clients /></PageAccessRoute>} />
            <Route path="analytics" element={<PageAccessRoute pageKey="analytics"><Analytics /></PageAccessRoute>} />
            <Route path="master" element={<PageAccessRoute pageKey="master"><Admin /></PageAccessRoute>} />

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
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
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
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
