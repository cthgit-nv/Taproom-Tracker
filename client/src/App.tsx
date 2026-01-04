import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import InventorySessionPage from "@/pages/inventory-session";
import InventoryDashboardPage from "@/pages/inventory-dashboard";
import ReceivingPage from "@/pages/receiving";
import SmartOrderPage from "@/pages/smart-order";
import AdminTeamPage from "@/pages/admin-team";
import NotFound from "@/pages/not-found";
import type { Settings } from "@shared/schema";

function SimulationBanner() {
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });
  
  if (!settings?.simulationMode) return null;
  
  return (
    <div className="fixed top-0 left-0 right-0 bg-orange-500 text-black text-center py-1 text-sm font-medium z-[100]">
      SIMULATION MODE
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/inventory" component={InventorySessionPage} />
      <Route path="/inventory-dashboard" component={InventoryDashboardPage} />
      <Route path="/receiving" component={ReceivingPage} />
      <Route path="/smart-order" component={SmartOrderPage} />
      <Route path="/admin/team" component={AdminTeamPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <SimulationBanner />
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
