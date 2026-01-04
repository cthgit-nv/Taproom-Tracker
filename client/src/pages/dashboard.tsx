import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { 
  Beer, 
  Package, 
  ShoppingCart, 
  Settings, 
  Home,
  LogOut,
  TrendingDown,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#051a11]">
        <div className="text-[#D4AF37] animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  // Placeholder stats - will be replaced with real data
  const stats = {
    lowStock: 5,
    tappedKegs: 12,
    onDeckKegs: 24,
    pendingOrders: 2,
  };

  return (
    <div className="min-h-screen bg-[#051a11] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1A4D2E] flex items-center justify-center border border-[#D4AF37]">
              <Beer className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white" data-testid="text-welcome">
                Welcome, {user.name}
              </h1>
              <Badge 
                variant="outline" 
                className="text-xs border-[#1A4D2E] text-[#D4AF37]"
                data-testid="badge-role"
              >
                {user.role}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-white/60"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-6 space-y-6">
        {/* Quick Stats */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Quick Overview</h2>
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-white/60 mb-1">Low Stock</p>
                    <p className="text-2xl font-bold text-[#D4AF37]" data-testid="text-low-stock">
                      {stats.lowStock}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-[#D4AF37]/10">
                    <TrendingDown className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-white/60 mb-1">Tapped Kegs</p>
                    <p className="text-2xl font-bold text-green-400" data-testid="text-tapped-kegs">
                      {stats.tappedKegs}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-white/60 mb-1">On Deck</p>
                    <p className="text-2xl font-bold text-white" data-testid="text-on-deck">
                      {stats.onDeckKegs}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5">
                    <Beer className="w-5 h-5 text-white/60" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-white/60 mb-1">Pending Orders</p>
                    <p className="text-2xl font-bold text-orange-400" data-testid="text-pending-orders">
                      {stats.pendingOrders}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <AlertCircle className="w-5 h-5 text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E] hover-elevate active-elevate-2 cursor-pointer overflow-visible">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                  <Package className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Scan Inventory</p>
                  <p className="text-sm text-white/60">Update product counts</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E] hover-elevate active-elevate-2 cursor-pointer overflow-visible">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                  <Beer className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Manage Taps</p>
                  <p className="text-sm text-white/60">Tap/kick kegs, view status</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E] hover-elevate active-elevate-2 cursor-pointer overflow-visible">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Create Order</p>
                  <p className="text-sm text-white/60">Restock low items</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a2419] border-t border-[#1A4D2E] px-2 py-2 safe-area-pb">
        <div className="flex items-center justify-around">
          <NavItem icon={Home} label="Dashboard" active />
          <NavItem icon={Package} label="Inventory" />
          <NavItem icon={Beer} label="Kegs" />
          <NavItem icon={ShoppingCart} label="Orders" />
          <NavItem icon={Settings} label="Settings" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ 
  icon: Icon, 
  label, 
  active = false 
}: { 
  icon: typeof Home; 
  label: string; 
  active?: boolean;
}) {
  return (
    <button
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
    </button>
  );
}
