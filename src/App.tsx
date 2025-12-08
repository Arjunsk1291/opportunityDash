import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import Dashboard from "./pages/Dashboard";
import Opportunities from "./pages/Opportunities";
import Tenders from "./pages/Tenders";
import Clients from "./pages/Clients";
import Analytics from "./pages/Analytics";
import Admin from "./pages/Admin";
import SharePoint from "./pages/SharePoint";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/opportunities" element={<Opportunities />} />
            <Route path="/tenders" element={<Tenders />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/sharepoint" element={<SharePoint />} />
            <Route path="/settings" element={<Settings />} />
            
            {/* Status-based routes */}
            <Route path="/status/pre-bid" element={<Opportunities statusFilter="Pre-bid" />} />
            <Route path="/status/in-progress" element={<Opportunities statusFilter="In Progress" />} />
            <Route path="/status/submitted" element={<Opportunities statusFilter="Submitted" />} />
            <Route path="/status/awarded" element={<Opportunities statusFilter="Awarded" />} />
            <Route path="/status/lost" element={<Opportunities statusFilter="Lost/Regretted" />} />
            <Route path="/status/on-hold" element={<Opportunities statusFilter="On Hold/Paused" />} />
            
            {/* Role-based routes */}
            <Route path="/my-pipeline" element={<Opportunities />} />
            <Route path="/team" element={<Analytics />} />
            <Route path="/at-risk" element={<Opportunities />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
