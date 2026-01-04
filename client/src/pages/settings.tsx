import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle, Shield, Database, Info, Home, Package, Beer, ShoppingCart, Settings as SettingsIcon } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Settings } from "@shared/schema";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const toggleSimulationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", "/api/settings", { simulationMode: enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: settings?.simulationMode ? "Simulation Disabled" : "Simulation Enabled",
        description: settings?.simulationMode 
          ? "Back to production mode" 
          : "Training data will be kept separate",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update simulation mode",
        variant: "destructive",
      });
    },
  });

  if (!user) {
    setLocation("/");
    return null;
  }

  const isOwner = user.role === "owner";

  return (
    <div className="min-h-screen bg-[#051a11] pb-24">
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">Settings</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {isOwner && (
          <Card className="bg-[#0a2419] border-2 border-orange-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-orange-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Simulation Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-white/60">
                Enable simulation mode for staff training. All inventory changes will be tracked separately and won't affect real data.
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    {settings?.simulationMode ? "Active" : "Disabled"}
                  </span>
                  {settings?.simulationMode && (
                    <Badge variant="outline" className="border-orange-500 text-orange-400 text-xs">
                      Training Mode
                    </Badge>
                  )}
                </div>
                <Switch
                  checked={settings?.simulationMode ?? false}
                  onCheckedChange={(checked) => toggleSimulationMutation.mutate(checked)}
                  disabled={isLoading || toggleSimulationMutation.isPending}
                  data-testid="switch-simulation-mode"
                />
              </div>
              {settings?.simulationMode && (
                <div className="bg-orange-500/10 rounded-md p-2 border border-orange-500/30">
                  <p className="text-xs text-orange-300 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Receiving, keg changes, and counts won't affect real inventory
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#D4AF37]" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Logged in as</span>
              <span className="text-white font-medium">{user.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">Role</span>
              <Badge 
                variant="outline" 
                className={
                  user.role === "owner" 
                    ? "border-[#D4AF37] text-[#D4AF37]"
                    : user.role === "admin"
                    ? "border-blue-500 text-blue-400"
                    : "border-[#1A4D2E] text-[#1A4D2E]"
                }
              >
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </Badge>
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-2 border-red-500/50 text-red-400"
              onClick={logout}
              data-testid="button-logout"
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#D4AF37]" />
              App Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Version</span>
              <span className="text-white/80 text-sm">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">Environment</span>
              <span className="text-white/80 text-sm">Production</span>
            </div>
          </CardContent>
        </Card>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a2419] border-t border-[#1A4D2E] px-2 py-2 safe-area-pb">
        <div className="flex items-center justify-around">
          <NavItem icon={Home} label="Dashboard" href="/dashboard" />
          <NavItem icon={Package} label="Inventory" href="/inventory-dashboard" />
          <NavItem icon={Beer} label="Kegs" href="/kegs" />
          <NavItem icon={ShoppingCart} label="Orders" href="/smart-order" />
          <NavItem icon={SettingsIcon} label="Settings" active />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ 
  icon: Icon, 
  label, 
  active = false,
  href
}: { 
  icon: typeof Home; 
  label: string; 
  active?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`
        flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[64px]
        transition-colors duration-150
        ${active 
          ? "text-[#D4AF37]" 
          : "text-white/50"
        }
      `}
      data-testid={`nav-${label.toLowerCase()}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-medium">{label}</span>
      {active && (
        <div className="w-1 h-1 rounded-full bg-[#D4AF37] mt-0.5" />
      )}
    </div>
  );
  
  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  
  return <button>{content}</button>;
}
