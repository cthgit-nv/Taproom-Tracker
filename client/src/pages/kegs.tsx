import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { 
  ArrowLeft, 
  Beer, 
  Droplet, 
  Package, 
  Home, 
  ShoppingCart, 
  Settings,
  Filter,
  MapPin,
} from "lucide-react";
import { Link } from "wouter";
import type { Keg, Product, Tap, Distributor, BeverageType } from "@shared/schema";

const BEVERAGE_TYPES: { value: BeverageType; label: string }[] = [
  { value: "beer", label: "Beer" },
  { value: "cider", label: "Cider" },
  { value: "wine", label: "Wine" },
  { value: "liquor", label: "Liquor" },
  { value: "na", label: "Non-Alcoholic" },
];

export default function KegsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [showFilters, setShowFilters] = useState(false);
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStyle, setFilterStyle] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: kegs = [], isLoading: kegsLoading } = useQuery<Keg[]>({
    queryKey: ["/api/kegs"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: taps = [] } = useQuery<Tap[]>({
    queryKey: ["/api/taps"],
  });

  const { data: distributors = [] } = useQuery<Distributor[]>({
    queryKey: ["/api/distributors"],
  });

  if (!user) {
    setLocation("/");
    return null;
  }

  const getProduct = (productId: number) => products.find(p => p.id === productId);
  const getTap = (kegId: number) => taps.find(t => t.currentKegId === kegId);

  const getPercentRemaining = (keg: Keg) => {
    if (!keg.remainingVolOz || !keg.initialVolOz) return 0;
    return Math.round((keg.remainingVolOz / keg.initialVolOz) * 100);
  };

  const brands = Array.from(new Set(products.map(p => p.brand).filter((x): x is string => Boolean(x))));
  const styles = Array.from(new Set(products.map(p => p.style).filter((x): x is string => Boolean(x))));

  const filterKeg = (keg: Keg) => {
    const product = getProduct(keg.productId);
    if (!product) return false;
    
    if (searchTerm && !product.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterBrand !== "all" && product.brand !== filterBrand) {
      return false;
    }
    if (filterType !== "all" && product.beverageType !== filterType) {
      return false;
    }
    if (filterStyle !== "all" && product.style !== filterStyle) {
      return false;
    }
    return true;
  };

  const filteredTappedKegs = kegs.filter(k => k.status === "tapped").filter(filterKeg);
  const filteredOnDeckKegs = kegs.filter(k => k.status === "on_deck").filter(filterKeg);

  const activeFiltersCount = [filterBrand, filterType, filterStyle]
    .filter(f => f !== "all").length + (searchTerm ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#051a11] pb-24">
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">Keg Inventory</h1>
            <p className="text-sm text-white/60">{filteredTappedKegs.length + filteredOnDeckKegs.length} kegs</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={`relative ${showFilters ? "text-[#D4AF37]" : "text-white/60"}`}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-5 h-5" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D4AF37] text-[#051a11] text-xs rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <div className="bg-[#0a2419] border-b border-[#1A4D2E] p-4 space-y-4">
            <Input
              placeholder="Search kegs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#051a11] border-[#1A4D2E] text-white"
              data-testid="input-search"
            />
            
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="select-type">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                    <SelectItem value="all" className="text-white">All Types</SelectItem>
                    {BEVERAGE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value} className="text-white">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Style</Label>
                <Select value={filterStyle} onValueChange={setFilterStyle}>
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="select-style">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                    <SelectItem value="all" className="text-white">All Styles</SelectItem>
                    {styles.map(style => (
                      <SelectItem key={style} value={style} className="text-white">{style}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Brand</Label>
                <Select value={filterBrand} onValueChange={setFilterBrand}>
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="select-brand">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                    <SelectItem value="all" className="text-white">All</SelectItem>
                    {brands.map(brand => (
                      <SelectItem key={brand} value={brand} className="text-white">{brand}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterBrand("all");
                  setFilterType("all");
                  setFilterStyle("all");
                  setSearchTerm("");
                }}
                className="text-[#D4AF37]"
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <main className="p-4 space-y-6">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Droplet className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">
              On Tap ({filteredTappedKegs.length})
            </h2>
          </div>
          {kegsLoading ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">Loading...</CardContent>
            </Card>
          ) : filteredTappedKegs.length === 0 ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">
                {activeFiltersCount > 0 ? "No kegs match your filters" : "No kegs currently tapped"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredTappedKegs.map(keg => {
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {tap && (
                            <Badge variant="outline" className="border-blue-500 text-blue-400">
                              Tap {tap.tapNumber}
                            </Badge>
                          )}
                          <span className="text-white font-medium truncate max-w-[150px]">
                            {product?.name || "Unknown"}
                          </span>
                          {product?.isLocal && (
                            <MapPin className="w-4 h-4 text-[#D4AF37]" />
                          )}
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
                      <div className="flex items-center justify-between mt-2 text-xs text-white/40 gap-2 flex-wrap">
                        <span>{keg.remainingVolOz?.toFixed(0) || 0} / {keg.initialVolOz?.toFixed(0) || 0} oz</span>
                        <div className="flex items-center gap-2">
                          {product?.style && (
                            <Badge variant="outline" className="text-xs border-[#1A4D2E] text-white/40">
                              {product.style}
                            </Badge>
                          )}
                          {keg.dateTapped && (
                            <span>Tapped {new Date(keg.dateTapped).toLocaleDateString()}</span>
                          )}
                        </div>
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
              On Deck ({filteredOnDeckKegs.length})
            </h2>
          </div>
          {kegsLoading ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">Loading...</CardContent>
            </Card>
          ) : filteredOnDeckKegs.length === 0 ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-4 text-center text-white/60">
                {activeFiltersCount > 0 ? "No kegs match your filters" : "No kegs in cooler backup"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                filteredOnDeckKegs.reduce<Record<number, Keg[]>>((acc, keg) => {
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
                    <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-white truncate max-w-[150px]">
                          {product?.name || "Unknown"}
                        </span>
                        {product?.isLocal && (
                          <MapPin className="w-4 h-4 text-[#D4AF37]" />
                        )}
                        {product?.style && (
                          <Badge variant="outline" className="text-xs border-[#1A4D2E] text-white/40">
                            {product.style}
                          </Badge>
                        )}
                      </div>
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
          <NavItem icon={Package} label="Products" href="/products" />
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
