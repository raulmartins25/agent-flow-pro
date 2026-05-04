import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Agents from "@/pages/Agents";
import AgentWizard from "@/pages/AgentWizard";
import InboxPage from "@/pages/InboxPage";
import BlastsPage from "@/pages/BlastsPage";
import NewBlastPage from "@/pages/NewBlastPage";
import BlastDetailPage from "@/pages/BlastDetailPage";
import SimulatorPage from "@/pages/SimulatorPage";
import PublicSimulatorPage from "@/pages/PublicSimulatorPage";
import SettingsPage from "@/pages/SettingsPage";
import ChipWarmupPage from "@/pages/ChipWarmupPage";
import DevicesPage from "@/pages/DevicesPage";
import LogsPage from "@/pages/LogsPage";
import TransfersPage from "@/pages/TransfersPage";
import ProspectingPage from "@/pages/ProspectingPage";
import AppointmentsPage from "@/pages/AppointmentsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/simulator/share/:token" element={<PublicSimulatorPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/agents/new" element={<AgentWizard />} />
              <Route path="/agents/:id/edit" element={<AgentWizard />} />
              <Route path="/agents/:id/simulator" element={<SimulatorPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/inbox/:conversationId" element={<InboxPage />} />
              <Route path="/blasts" element={<BlastsPage />} />
              <Route path="/blasts/new" element={<NewBlastPage />} />
              <Route path="/blasts/:id" element={<BlastDetailPage />} />
              <Route path="/transfers" element={<TransfersPage />} />
              <Route path="/appointments" element={<AppointmentsPage />} />
              <Route path="/prospecting" element={<ProspectingPage />} />
              <Route path="/warmup" element={<ChipWarmupPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
