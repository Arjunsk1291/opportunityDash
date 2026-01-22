import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./config/msalConfig";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Sonner } from "sonner";

const queryClient = new QueryClient();

const App = () => (
  <MsalProvider instance={msalInstance}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
          <DataProvider>
            <ApprovalProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route
                      path="/*"
                      element={
                        <ProtectedRoute>
                          <Layout>
                            <Routes>
                              <Route path="/" element={<Dashboard />} />
                              <Route path="/opportunities" element={<Opportunities />} />
                              <Route path="/clients" element={<Clients />} />
                              <Route path="/analytics" element={<Analytics />} />
                              <Route path="/master" element={<Admin />} />
                              
                              <Route path="/status/pre-bid" element={<Opportunities statusFilter="Pre-bid" />} />
                              <Route path="/status/in-progress" element={<Opportunities statusFilter="In Progress" />} />
                              <Route path="/status/submitted" element={<Opportunities statusFilter="Submitted" />} />
                              <Route path="/status/awarded" element={<Opportunities statusFilter="Awarded" />} />
                              <Route path="/status/lost" element={<Opportunities statusFilter="Lost/Regretted" />} />
                              <Route path="/status/on-hold" element={<Opportunities statusFilter="On Hold/Paused" />} />
                              
                              <Route path="/my-pipeline" element={<Opportunities />} />
                              <Route path="/team" element={<Analytics />} />
                              <Route path="/at-risk" element={<Opportunities />} />
                              
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </Layout>
                        </ProtectedRoute>
                      }
                    />
                  </Routes>
                </BrowserRouter>
              </TooltipProvider>
            </ApprovalProvider>
          </DataProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  </MsalProvider>
);

export default App;
