import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Beer, Droplet, Package, Home, ShoppingCart, Settings } from "lucide-react";
import { Link } from "wouter";
import type { Keg, Product, Tap } from "@shared/schema";

export default function KegsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: kegs = [], isLoading: kegsLoading } = useQuery<Keg[]>({
    queryKey: ["/api/kegs"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: taps = [] } = useQuery<Tap[]>({
    queryKey: ["/api/taps"],
  });

  if (!user) {
    setLocation("/");
    return null;
  }

  const tappedKegs = kegs.filter(k => k.status === "tapped");
  const onDeckKegs = kegs.filter(k => k.status === "on_deck");

  const getProduct = (productId: number) => products.find(p => p.id === productId);
  const getTap = (kegId: number) => taps.find(t => t.currentKegId === kegId);

  const getPercentRemaining = (keg: Keg) => {
    if (!keg.remainingVolOz || !keg.initialVolOz) return 0;
    return Math.round((keg.remainingVolOz / keg.initialVolOz) * 100);
  };

  return (
    <div className="min-h-screen bg-[#051a11] pb-24">
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">Keg Inventory</h1>
        </div>
      </header>

      <main className="p-4 space-y-6">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Droplet className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">
              On Tap ({tappedKegs.length})
            </h2>
          </div>
          {kegsLoading ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">Loading...</CardContent>
            </Card>
          ) : tappedKegs.length === 0 ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">
                No kegs currently tapped
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tappedKegs.map(keg => {
                const product = getProduct(keg.productId);
                const tap = getTap(keg.id);
                const percent = getPercentRemaining(keg);
                return (
                  <Card 
                    key={keg.id} 
                    className="bg-[#0a2419] border-2 border-blue-500/30"
                    data-testid={`card-keg-tapped-${keg.id}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {tap && (
                            <Badge variant="outline" className="border-blue-500 text-blue-400">
                              Tap {tap.tapNumber}
                            </Badge>
                          )}
                          <span className="text-white font-medium truncate max-w-[180px]">
                            {product?.name || "Unknown"}
                          </span>
                        </div>
                        <span className={`text-sm font-bold ${
                          percent > 50 ? "text-green-400" :
                          percent > 25 ? "text-yellow-400" :
                          "text-red-400"
                        }`}>
                          {percent}%
                        </span>
                      </div>
                      <Progress 
                        value={percent} 
                        className="h-2 bg-[#1A4D2E]"
                      />
                      <div className="flex items-center justify-between mt-2 text-xs text-white/40">
                        <span>{keg.remainingVolOz?.toFixed(0) || 0} / {keg.initialVolOz?.toFixed(0) || 0} oz</span>
                        {keg.dateTapped && (
                          <span>Tapped {new Date(keg.dateTapped).toLocaleDateString()}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-lg font-semibold text-white">
              On Deck ({onDeckKegs.length})
            </h2>
          </div>
          {kegsLoading ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">Loading...</CardContent>
            </Card>
          ) : onDeckKegs.length === 0 ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">
                No kegs in cooler backup
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                onDeckKegs.reduce<Record<number, Keg[]>>((acc, keg) => {
                  if (!acc[keg.productId]) acc[keg.productId] = [];
                  acc[keg.productId].push(keg);
                  return acc;
                }, {})
              ).map(([productId, productKegs]) => {
                const product = getProduct(Number(productId));
                return (
                  <Card 
                    key={productId}
                    className="bg-[#0a2419] border-[#1A4D2E]"
                    data-testid={`card-keg-ondeck-${productId}`}
                  >
                    <CardContent className="p-3 flex items-center justify-between">
                      <span className="text-white truncate max-w-[200px]">
                        {product?.name || "Unknown"}
                      </span>
                      <Badge className="bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/50">
                        {productKegs.length} keg{productKegs.length !== 1 ? "s" : ""}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a2419] border-t border-[#1A4D2E] px-2 py-2 safe-area-pb">
        <div className="flex items-center justify-around">
          <NavItem icon={Home} label="Dashboard" href="/dashboard" />
          <NavItem icon={Package} label="Inventory" href="/inventory-dashboard" />
          <NavItem icon={Beer} label="Kegs" active />
          <NavItem icon={ShoppingCart} label="Orders" href="/smart-order" />
          <NavItem icon={Settings} label="Settings" href="/settings" />
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
