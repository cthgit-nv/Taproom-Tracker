import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Filter,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Home,
  Package,
  Beer,
  ShoppingCart,
  Settings as SettingsIcon,
  MapPin,
  Star,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Product, Distributor, BeverageType } from "@shared/schema";

const BEVERAGE_TYPES: { value: BeverageType; label: string }[] = [
  { value: "beer", label: "Beer" },
  { value: "cider", label: "Cider" },
  { value: "wine", label: "Wine" },
  { value: "liquor", label: "Liquor" },
  { value: "na", label: "Non-Alcoholic" },
];

export default function ProductsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showFilters, setShowFilters] = useState(false);
  const [filterManufacturer, setFilterManufacturer] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStyle, setFilterStyle] = useState<string>("all");
  const [filterDistributor, setFilterDistributor] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: distributors = [] } = useQuery<Distributor[]>({
    queryKey: ["/api/distributors"],
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Product> }) => {
      const res = await apiRequest("PATCH", `/api/products/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product Updated", description: "Changes saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update product", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#051a11]">
        <div className="text-[#D4AF37] animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  const manufacturers = Array.from(new Set(products.map(p => p.manufacturer).filter((x): x is string => Boolean(x))));
  const styles = Array.from(new Set(products.map(p => p.style).filter((x): x is string => Boolean(x))));
  const types = Array.from(new Set(products.map(p => p.beverageType).filter(Boolean))) as string[];

  // Count products by category for nav badges
  const categoryCounts = {
    all: products.length,
    beer: products.filter(p => p.beverageType === "beer").length,
    cider: products.filter(p => p.beverageType === "cider").length,
    wine: products.filter(p => p.beverageType === "wine").length,
    liquor: products.filter(p => p.beverageType === "liquor").length,
    na: products.filter(p => p.beverageType === "na").length,
  };

  const filteredProducts = products.filter(product => {
    // Category quick filter (overrides type filter)
    if (activeCategory !== "all" && product.beverageType !== activeCategory) {
      return false;
    }
    if (searchTerm && !product.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterManufacturer !== "all" && product.manufacturer !== filterManufacturer) {
      return false;
    }
    // Only apply type filter if category is "all"
    if (activeCategory === "all" && filterType !== "all" && product.beverageType !== filterType) {
      return false;
    }
    if (filterStyle !== "all" && product.style !== filterStyle) {
      return false;
    }
    if (filterDistributor !== "all" && String(product.distributorId) !== filterDistributor) {
      return false;
    }
    return true;
  });

  const activeFiltersCount = [filterManufacturer, filterType, filterStyle, filterDistributor]
    .filter(f => f !== "all").length;

  return (
    <div className="min-h-screen bg-[#051a11] pb-24">
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            className="text-white/60"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">Products</h1>
            <p className="text-sm text-white/60">{filteredProducts.length} items</p>
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

      {/* Category Quick Navigation */}
      <div className="sticky top-[57px] z-40 bg-[#051a11] border-b border-[#1A4D2E] overflow-x-auto">
        <div className="flex gap-1 p-2 min-w-max">
          {[
            { key: "all", label: "All", icon: Package },
            { key: "beer", label: "Beer", icon: Beer },
            { key: "cider", label: "Cider", icon: Beer },
            { key: "wine", label: "Wine", icon: Beer },
            { key: "liquor", label: "Liquor", icon: Beer },
            { key: "na", label: "N/A", icon: Beer },
          ].map(({ key, label }) => (
            <Button
              key={key}
              variant={activeCategory === key ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveCategory(key)}
              className={`flex-shrink-0 gap-1 ${
                activeCategory === key 
                  ? "bg-[#1A4D2E] text-white" 
                  : "text-white/60"
              }`}
              data-testid={`category-${key}`}
            >
              {label}
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs bg-white/10">
                {categoryCounts[key as keyof typeof categoryCounts]}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <div className="bg-[#0a2419] border-b border-[#1A4D2E] p-4 space-y-4">
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#051a11] border-[#1A4D2E] text-white"
              data-testid="input-search"
            />
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="select-type">
                    <SelectValue placeholder="All Types" />
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
                    <SelectValue placeholder="All Styles" />
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
                <Label className="text-white/60 text-xs">Manufacturer</Label>
                <Select value={filterManufacturer} onValueChange={setFilterManufacturer}>
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="select-manufacturer">
                    <SelectValue placeholder="All Manufacturers" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                    <SelectItem value="all" className="text-white">All Manufacturers</SelectItem>
                    {manufacturers.map(mfr => (
                      <SelectItem key={mfr} value={mfr} className="text-white">{mfr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Distributor</Label>
                <Select value={filterDistributor} onValueChange={setFilterDistributor}>
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="select-distributor">
                    <SelectValue placeholder="All Distributors" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                    <SelectItem value="all" className="text-white">All Distributors</SelectItem>
                    {distributors.map(dist => (
                      <SelectItem key={dist.id} value={String(dist.id)} className="text-white">{dist.name}</SelectItem>
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
                  setFilterManufacturer("all");
                  setFilterType("all");
                  setFilterStyle("all");
                  setFilterDistributor("all");
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

      <main className="p-4 space-y-3">
        {productsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            No products match your filters
          </div>
        ) : (
          filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              distributors={distributors}
              isExpanded={expandedProduct === product.id}
              onToggle={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
              onUpdate={(updates) => updateProductMutation.mutate({ id: product.id, updates })}
              isSaving={updateProductMutation.isPending}
            />
          ))
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a2419] border-t border-[#1A4D2E] px-2 py-2 safe-area-pb">
        <div className="flex items-center justify-around">
          <NavItem icon={Home} label="Dashboard" href="/dashboard" />
          <NavItem icon={Package} label="Products" active />
          <NavItem icon={Beer} label="Kegs" href="/kegs" />
          <NavItem icon={ShoppingCart} label="Orders" href="/smart-order" />
          <NavItem icon={SettingsIcon} label="Settings" href="/settings" />
        </div>
      </nav>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  distributors: Distributor[];
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<Product>) => void;
  isSaving: boolean;
}

function ProductCard({ product, distributors, isExpanded, onToggle, onUpdate, isSaving }: ProductCardProps) {
  const [editState, setEditState] = useState({
    distributorId: product.distributorId,
    isLocal: product.isLocal ?? false,
    notes: product.notes ?? "",
    manufacturer: product.manufacturer ?? "",
    beverageType: product.beverageType ?? "beer",
    style: product.style ?? "",
  });

  const hasChanges =
    editState.distributorId !== product.distributorId ||
    editState.isLocal !== (product.isLocal ?? false) ||
    editState.notes !== (product.notes ?? "") ||
    editState.manufacturer !== (product.manufacturer ?? "") ||
    editState.beverageType !== (product.beverageType ?? "beer") ||
    editState.style !== (product.style ?? "");

  const handleSave = () => {
    onUpdate({
      distributorId: editState.distributorId,
      isLocal: editState.isLocal,
      notes: editState.notes || null,
      manufacturer: editState.manufacturer || null,
      beverageType: editState.beverageType as BeverageType,
      style: editState.style || null,
    });
  };

  const distributor = distributors.find(d => d.id === product.distributorId);

  return (
    <Card 
      className={`bg-[#0a2419] border-2 overflow-visible ${isExpanded ? "border-[#D4AF37]" : "border-[#1A4D2E]"}`}
      data-testid={`product-card-${product.id}`}
    >
      <CardContent className="p-0">
        <button
          onClick={onToggle}
          className="w-full p-4 flex items-center gap-3 text-left"
          data-testid={`button-expand-product-${product.id}`}
        >
          {product.labelImageUrl ? (
            <img
              src={product.labelImageUrl}
              alt={product.name}
              className="w-12 h-12 rounded-md object-cover bg-[#051a11]"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-[#051a11] flex items-center justify-center">
              <Beer className="w-6 h-6 text-white/40" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">{product.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {product.beverageType && (
                <Badge variant="outline" className="text-xs border-[#1A4D2E] text-white/60">
                  {product.beverageType}
                </Badge>
              )}
              {product.style && (
                <Badge variant="outline" className="text-xs border-[#1A4D2E] text-white/60">
                  {product.style}
                </Badge>
              )}
              {product.isLocal && (
                <Badge className="text-xs bg-[#1A4D2E] text-[#D4AF37]">
                  <MapPin className="w-3 h-3 mr-1" />
                  Local
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {product.untappdRating && (
              <div className="flex items-center gap-1 text-[#D4AF37]">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm">{product.untappdRating.toFixed(1)}</span>
              </div>
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-white/40" />
            ) : (
              <ChevronDown className="w-5 h-5 text-white/40" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-[#1A4D2E] pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Type</Label>
                <Select
                  value={editState.beverageType}
                  onValueChange={(v) => setEditState({ ...editState, beverageType: v as BeverageType })}
                >
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
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
                <Input
                  value={editState.style}
                  onChange={(e) => setEditState({ ...editState, style: e.target.value })}
                  placeholder="e.g., IPA, Lager, Amber"
                  className="bg-[#051a11] border-[#1A4D2E] text-white"
                  data-testid="edit-style"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Manufacturer</Label>
                <Input
                  value={editState.manufacturer}
                  onChange={(e) => setEditState({ ...editState, manufacturer: e.target.value })}
                  placeholder="e.g., Sierra Nevada"
                  className="bg-[#051a11] border-[#1A4D2E] text-white"
                  data-testid="edit-manufacturer"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Distributor</Label>
                <Select
                  value={editState.distributorId ? String(editState.distributorId) : "none"}
                  onValueChange={(v) => setEditState({ ...editState, distributorId: v === "none" ? null : Number(v) })}
                >
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="edit-distributor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                    <SelectItem value="none" className="text-white/60">No Distributor</SelectItem>
                    {distributors.map(dist => (
                      <SelectItem key={dist.id} value={String(dist.id)} className="text-white">
                        {dist.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editState.isLocal}
                  onCheckedChange={(checked) => setEditState({ ...editState, isLocal: checked })}
                  data-testid="edit-is-local"
                />
                <Label className="text-white">Local Product</Label>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Notes</Label>
              <Textarea
                value={editState.notes}
                onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                placeholder="Add notes about this product..."
                className="bg-[#051a11] border-[#1A4D2E] text-white resize-none"
                rows={3}
                data-testid="edit-notes"
              />
            </div>

            {(product.abv || product.ibu) && (
              <div className="flex gap-4 text-sm text-white/60">
                {product.abv && <span>ABV: {product.abv}%</span>}
                {product.ibu && <span>IBU: {product.ibu}</span>}
              </div>
            )}

            {product.description && (
              <p className="text-sm text-white/60">{product.description}</p>
            )}

            {hasChanges && (
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 bg-[#D4AF37] text-[#051a11]"
                  data-testid="button-save-product"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEditState({
                    distributorId: product.distributorId,
                    isLocal: product.isLocal ?? false,
                    notes: product.notes ?? "",
                    manufacturer: product.manufacturer ?? "",
                    beverageType: product.beverageType ?? "beer",
                    style: product.style ?? "",
                  })}
                  className="text-white/60"
                  data-testid="button-cancel-edit"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
