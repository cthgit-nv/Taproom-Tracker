import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Camera, 
  Check,
  Plus,
  Package,
  Beer,
  AlertCircle,
  Search,
  Loader2,
  Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Product, Distributor, Settings } from "@shared/schema";
import { untappdService, type UntappdBeer } from "@/services/UntappdService";

type Mode = "scanning" | "known_product" | "new_product";

// Helper to normalize Barcode Spider category to our beverage types
// Uses both category and parentCategory for better detection
// PRIORITY: Check parentCategory first as it's more reliable for categorization
function normalizeBeverageType(category: string | undefined, parentCategory?: string): string {
  const categoryStr = (category || "").toLowerCase();
  const parentStr = (parentCategory || "").toLowerCase();
  
  // PRIORITY 1: Check parentCategory first - it's the most reliable indicator
  // Barcode Spider often has "Wines & Spirits" as parent for all liquor/spirits
  if (parentStr.includes("spirit") || parentStr.includes("liquor")) {
    // But still check if it's specifically wine within "Wines & Spirits"
    if (categoryStr.includes("wine") || categoryStr.includes("champagne") || 
        categoryStr.includes("prosecco") || categoryStr.includes("vermouth")) {
      return "wine";
    }
    return "spirits";
  }
  
  if (parentStr.includes("wine")) {
    return "wine";
  }
  
  if (parentStr.includes("beer") || parentStr.includes("brew")) {
    return "beer";
  }
  
  // PRIORITY 2: Check specific category keywords
  const combined = `${categoryStr} ${parentStr}`;
  
  // Spirits detection - check category for spirit-specific terms
  if (categoryStr.includes("whiskey") || categoryStr.includes("whisky") ||
      categoryStr.includes("bourbon") || categoryStr.includes("vodka") ||
      categoryStr.includes("gin") || categoryStr.includes("rum") ||
      categoryStr.includes("tequila") || categoryStr.includes("brandy") ||
      categoryStr.includes("scotch") || categoryStr.includes("cognac") ||
      categoryStr.includes("liqueur") || categoryStr.includes("mezcal") ||
      categoryStr.includes("liquor") || categoryStr.includes("spirit") ||
      categoryStr.includes("aperitif") || categoryStr.includes("digestif") ||
      categoryStr.includes("amaro") || categoryStr.includes("bitters")) {
    return "spirits";
  }
  
  // Wine detection
  if (combined.includes("wine") || combined.includes("champagne") || 
      combined.includes("prosecco") || combined.includes("merlot") ||
      combined.includes("cabernet") || combined.includes("chardonnay") ||
      combined.includes("pinot") || combined.includes("sauvignon")) {
    return "wine";
  }
  
  // Kombucha
  if (combined.includes("kombucha")) {
    return "kombucha";
  }
  
  // Cider detection
  if (combined.includes("cider")) {
    return "cider";
  }
  
  // Non-alcoholic / Seltzer detection
  if (combined.includes("seltzer") || combined.includes("non-alcoholic") ||
      combined.includes("non alcoholic") || combined.includes("n/a") ||
      combined.includes("soda") || combined.includes("water") ||
      combined.includes("juice") || combined.includes("soft drink") ||
      combined.includes("energy drink")) {
    return "na";
  }
  
  // Beer detection - only if explicitly beer-related
  if (combined.includes("beer") || combined.includes("lager") ||
      combined.includes("stout") || combined.includes("pilsner") ||
      combined.includes("porter") || combined.includes("brew")) {
    return "beer";
  }
  
  // NOTE: "ale" and "ipa" removed from beer detection as they can appear
  // in spirit names like "Ginger Ale" flavored spirits
  
  // Default to spirits for "Food, Beverages & Tobacco" category that 
  // doesn't match other patterns - safer for taproom context
  if (parentStr.includes("beverage") || parentStr.includes("tobacco")) {
    return "spirits";
  }
  
  // Default to beer for truly unknown categories
  return "beer";
}

// Helper to extract spirit style from Barcode Spider category
function getSpiritStyle(category: string | undefined): string | undefined {
  if (!category) return undefined;
  const lowerCategory = category.toLowerCase();
  
  if (lowerCategory.includes("whiskey") || lowerCategory.includes("whisky")) return "Whiskey";
  if (lowerCategory.includes("bourbon")) return "Bourbon";
  if (lowerCategory.includes("scotch")) return "Scotch";
  if (lowerCategory.includes("vodka")) return "Vodka";
  if (lowerCategory.includes("gin")) return "Gin";
  if (lowerCategory.includes("rum")) return "Rum";
  if (lowerCategory.includes("tequila")) return "Tequila";
  if (lowerCategory.includes("mezcal")) return "Mezcal";
  if (lowerCategory.includes("brandy")) return "Brandy";
  if (lowerCategory.includes("cognac")) return "Cognac";
  if (lowerCategory.includes("liqueur")) return "Liqueur";
  if (lowerCategory.includes("vermouth")) return "Vermouth";
  if (lowerCategory.includes("amaro")) return "Amaro";
  
  return undefined;
}

export default function ReceivingPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<Mode>("scanning");
  const [scannedUpc, setScannedUpc] = useState<string | null>(null);
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
  const [recentReceived, setRecentReceived] = useState<Array<{product: Product; qty: number; isKeg: boolean}>>([]);
  
  // New product form
  const [newProductName, setNewProductName] = useState("");
  const [newProductDistributor, setNewProductDistributor] = useState<number | null>(null);
  const [isKeg, setIsKeg] = useState(false);
  
  // Untappd search state
  const [showUntappdSearch, setShowUntappdSearch] = useState(false);
  const [untappdSearchQuery, setUntappdSearchQuery] = useState("");
  const [untappdResults, setUntappdResults] = useState<UntappdBeer[]>([]);
  const [untappdSearching, setUntappdSearching] = useState(false);
  const [selectedUntappdBeer, setSelectedUntappdBeer] = useState<UntappdBeer | null>(null);
  
  // Additional product fields from Untappd
  const [newProductAbv, setNewProductAbv] = useState<number | null>(null);
  const [newProductIbu, setNewProductIbu] = useState<number | null>(null);
  const [newProductStyle, setNewProductStyle] = useState("");
  const [newProductDescription, setNewProductDescription] = useState("");
  const [newProductLabelUrl, setNewProductLabelUrl] = useState("");
  const [newProductUntappdId, setNewProductUntappdId] = useState<number | null>(null);
  const [newProductRating, setNewProductRating] = useState<number | null>(null);
  
  // Brand and beverage type from Barcode Spider
  const [newProductBrand, setNewProductBrand] = useState("");
  const [newProductBeverageType, setNewProductBeverageType] = useState<string>("beer");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: distributors = [] } = useQuery<Distributor[]>({
    queryKey: ["/api/distributors"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  // Configure Untappd service when settings load
  useEffect(() => {
    if (settings) {
      untappdService.setConfig(settings);
    }
  }, [settings]);

  const receiveMutation = useMutation({
    mutationFn: async (data: { productId: number; quantity: number; isKeg: boolean }) => {
      const res = await apiRequest("POST", "/api/receiving", data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      const product = products.find(p => p.id === variables.productId) || foundProduct;
      if (product) {
        setRecentReceived([
          { product, qty: variables.quantity, isKeg: variables.isKeg },
          ...recentReceived.slice(0, 9)
        ]);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kegs"] });
      
      toast({
        title: variables.isKeg ? "Keg Added" : "Inventory Updated",
        description: `${product?.name}: ${variables.isKeg ? "Added to On Deck" : `+${variables.quantity} bottles`}`,
      });
      
      resetToScanning();
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      upc: string; 
      distributorId: number | null;
      abv?: number | null;
      ibu?: number | null;
      style?: string;
      description?: string;
      labelImageUrl?: string;
      untappdId?: number | null;
      untappdRating?: number | null;
      isSoldByVolume?: boolean;
      brand?: string;
      beverageType?: string;
      skipDuplicateCheck?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/products", data);
      return res.json();
    },
    onSuccess: (product: Product) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setFoundProduct(product);
      setMode("known_product");
    },
  });

  // Untappd search handler
  const handleUntappdSearch = async () => {
    if (!untappdSearchQuery.trim()) return;
    
    setUntappdSearching(true);
    try {
      const results = await untappdService.searchBeer(untappdSearchQuery);
      setUntappdResults(results);
    } catch (error) {
      toast({
        title: "Search Failed",
        description: "Could not search Untappd",
        variant: "destructive",
      });
    } finally {
      setUntappdSearching(false);
    }
  };

  // Select beer from Untappd results
  const handleSelectUntappdBeer = (beer: UntappdBeer) => {
    setSelectedUntappdBeer(beer);
    setNewProductName(beer.name);
    setNewProductAbv(beer.abv);
    setNewProductIbu(beer.ibu);
    setNewProductStyle(beer.style);
    setNewProductDescription(beer.description);
    setNewProductLabelUrl(beer.label);
    setNewProductUntappdId(beer.id);
    setNewProductRating(beer.rating);
    setIsKeg(true); // Beer from Untappd is typically a keg
    setShowUntappdSearch(false);
    // Set brand from brewery and beverageType to beer
    setNewProductBrand(beer.breweryName || "");
    setNewProductBeverageType("beer");
    
    toast({
      title: "Beer Selected",
      description: `${beer.name}${beer.breweryName ? ` by ${beer.breweryName}` : ""} details auto-filled`,
    });
  };

  const lookupProduct = async (upc: string) => {
    try {
      // First check our internal database
      const res = await fetch(`/api/products/upc/${upc}`);
      const product = await res.json();
      
      if (product) {
        setFoundProduct(product);
        setIsKeg(product.isSoldByVolume || false);
        setMode("known_product");
        
        toast({
          title: product.name,
          description: product.isSoldByVolume ? "Keg detected" : "Enter quantity",
        });
      } else {
        // Product not found in our database - try Barcode Spider
        setMode("new_product");
        
        try {
          const barcodeRes = await fetch(`/api/barcodespider/lookup/${upc}`);
          if (barcodeRes.ok) {
            const barcodeData = await barcodeRes.json();
            if (barcodeData && barcodeData.title) {
              // Pre-fill form with Barcode Spider data
              setNewProductName(barcodeData.title);
              
              // Map brand from Barcode Spider - prefer brand, fallback to manufacturer
              const brandValue = barcodeData.brand || barcodeData.manufacturer || "";
              if (brandValue) {
                setNewProductBrand(brandValue);
              }
              
              // Map category to beverageType using both category and parentCategory
              const beverageType = normalizeBeverageType(barcodeData.category, barcodeData.parentCategory);
              setNewProductBeverageType(beverageType);
              
              // For spirits, set the style from the category
              if (beverageType === "spirits") {
                const spiritStyle = getSpiritStyle(barcodeData.category);
                if (spiritStyle) {
                  setNewProductStyle(spiritStyle);
                }
              }
              
              // Also use description if available
              if (barcodeData.description) {
                setNewProductDescription(barcodeData.description);
              }
              
              toast({
                title: "Product Found",
                description: `Found: ${barcodeData.title}${brandValue ? ` by ${brandValue}` : ""}`,
              });
            } else {
              toast({
                title: "New Item",
                description: "Product not in database. Enter details manually.",
              });
            }
          } else {
            // Check for specific API errors
            const errorData = await barcodeRes.json().catch(() => ({}));
            const errorMsg = errorData?.error || "";
            
            if (errorMsg.includes("AUTH_EXPIRED") || errorMsg.includes("subscription")) {
              toast({
                title: "API Subscription Expired",
                description: "Barcode Spider subscription needs renewal. Enter product details manually.",
                variant: "destructive",
              });
            } else if (errorMsg.includes("RATE_LIMIT")) {
              toast({
                title: "Rate Limit",
                description: "Too many lookups. Please wait and try again.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "New Item",
                description: "Please enter product details",
              });
            }
          }
        } catch {
          toast({
            title: "New Item",
            description: "Please enter product details",
          });
        }
      }
    } catch (error) {
      console.error("Lookup error:", error);
    }
  };

  const handleSimulateScan = (upc: string) => {
    setScannedUpc(upc);
    lookupProduct(upc);
  };

  const handleReceive = () => {
    if (!foundProduct) return;
    
    if (isKeg) {
      receiveMutation.mutate({
        productId: foundProduct.id,
        quantity: 1,
        isKeg: true,
      });
    } else {
      const qty = parseInt(quantity);
      if (isNaN(qty) || qty <= 0) {
        toast({
          title: "Invalid Quantity",
          description: "Please enter a valid number",
          variant: "destructive",
        });
        return;
      }
      receiveMutation.mutate({
        productId: foundProduct.id,
        quantity: qty,
        isKeg: false,
      });
    }
  };

  const handleCreateProduct = () => {
    if (!newProductName || !scannedUpc) return;
    
    createProductMutation.mutate({
      name: newProductName,
      upc: scannedUpc,
      distributorId: newProductDistributor,
      abv: newProductAbv,
      ibu: newProductIbu,
      style: newProductStyle,
      description: newProductDescription,
      labelImageUrl: newProductLabelUrl,
      untappdId: newProductUntappdId,
      untappdRating: newProductRating,
      isSoldByVolume: isKeg,
      brand: newProductBrand || undefined,
      beverageType: newProductBeverageType,
      skipDuplicateCheck: true, // Skip since we're creating from barcode lookup
    });
  };

  const resetToScanning = () => {
    setMode("scanning");
    setScannedUpc(null);
    setFoundProduct(null);
    setQuantity("");
    setNewProductName("");
    setNewProductDistributor(null);
    setIsKeg(false);
    // Reset Untappd fields
    setSelectedUntappdBeer(null);
    setNewProductAbv(null);
    setNewProductIbu(null);
    setNewProductStyle("");
    setNewProductDescription("");
    setNewProductLabelUrl("");
    setNewProductUntappdId(null);
    setNewProductRating(null);
    setUntappdResults([]);
    setUntappdSearchQuery("");
    // Reset Barcode Spider fields
    setNewProductBrand("");
    setNewProductBeverageType("beer");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#051a11]">
        <div className="text-[#D4AF37] animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#051a11]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (mode === "scanning") {
                setLocation("/dashboard");
              } else {
                resetToScanning();
              }
            }}
            className="text-white/60"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-white">Receiving</h1>
            <p className="text-sm text-white/60">
              {mode === "scanning" && "Scan incoming items"}
              {mode === "known_product" && "Enter quantity"}
              {mode === "new_product" && "New product"}
            </p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* SCANNING MODE */}
        {mode === "scanning" && (
          <>
            {/* Camera Preview */}
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E] overflow-hidden">
              <CardContent className="p-0">
                <div className="aspect-[4/3] bg-black flex items-center justify-center">
                  <div className="text-center text-white/60">
                    <Camera className="w-16 h-16 mx-auto mb-2" />
                    <p>Camera Active</p>
                    <p className="text-sm">(Simulated - tap product below)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Simulation buttons */}
            <div className="space-y-2">
              <p className="text-sm text-white/60">Simulate scanning:</p>
              <div className="grid grid-cols-2 gap-2">
                {products.slice(0, 4).map((product) => (
                  <Button
                    key={product.id}
                    variant="outline"
                    onClick={() => handleSimulateScan(product.upc || `UPC-${product.id}`)}
                    className="text-sm border-[#1A4D2E] text-white/80 justify-start"
                    data-testid={`scan-product-${product.id}`}
                  >
                    <Package className="w-4 h-4 mr-2" />
                    {product.name.substring(0, 12)}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  onClick={() => handleSimulateScan("UNKNOWN-123456")}
                  className="text-sm border-[#1A4D2E] text-orange-400 justify-start"
                  data-testid="scan-unknown"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Unknown Item
                </Button>
              </div>
            </div>

            {/* Recent Received */}
            {recentReceived.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-white/60">Recently Received:</p>
                {recentReceived.map((item, idx) => (
                  <Card key={idx} className="bg-[#0a2419] border border-[#1A4D2E]">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{item.product.name}</p>
                      </div>
                      <Badge variant="outline" className="border-[#1A4D2E] text-white/60">
                        {item.isKeg ? "1 Keg" : `+${item.qty}`}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* KNOWN PRODUCT MODE */}
        {mode === "known_product" && foundProduct && (
          <div className="space-y-6">
            {/* Product Card */}
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4 flex items-center gap-4">
                {foundProduct.labelImageUrl ? (
                  <img 
                    src={foundProduct.labelImageUrl} 
                    alt={foundProduct.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                    {isKeg ? (
                      <Beer className="w-10 h-10 text-[#D4AF37]" />
                    ) : (
                      <Package className="w-10 h-10 text-[#D4AF37]" />
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-white text-lg">{foundProduct.name}</p>
                  <p className="text-sm text-white/60">
                    {foundProduct.bottleSizeMl}ml
                    {foundProduct.style ? ` - ${foundProduct.style}` : ""}
                  </p>
                  {isKeg && (
                    <Badge className="mt-1 bg-[#D4AF37]/20 text-[#D4AF37] border-none">
                      Keg
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quantity Input (only for bottles) */}
            {!isKeg && (
              <div className="space-y-2">
                <Label className="text-white">Quantity (Bottles)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className="h-14 text-2xl text-center bg-[#0a2419] border-2 border-[#1A4D2E] text-white"
                  autoFocus
                  data-testid="input-quantity"
                />
              </div>
            )}

            {/* Keg Info */}
            {isKeg && (
              <Card className="bg-[#0a2419] border-2 border-[#D4AF37]/50">
                <CardContent className="p-4 text-center">
                  <Beer className="w-12 h-12 mx-auto text-[#D4AF37] mb-2" />
                  <p className="text-white font-medium">Keg will be added to "On Deck"</p>
                  <p className="text-sm text-white/60">No quantity needed</p>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleReceive}
                disabled={receiveMutation.isPending || (!isKeg && !quantity)}
                className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
                data-testid="button-receive"
              >
                {receiveMutation.isPending ? "Saving..." : (isKeg ? "Add Keg" : "Enter")}
              </Button>
              <Button
                variant="outline"
                onClick={resetToScanning}
                className="w-full border-[#1A4D2E] text-white/60"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* NEW PRODUCT MODE */}
        {mode === "new_product" && (
          <div className="space-y-6">
            <Card className="bg-[#0a2419] border-2 border-orange-500/50">
              <CardContent className="p-4 text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-orange-400 mb-2" />
                <p className="text-white font-medium">New Item Found</p>
                <p className="text-sm text-white/60">UPC: {scannedUpc}</p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white">Product Name</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUntappdSearchQuery(newProductName);
                      setShowUntappdSearch(true);
                    }}
                    className="border-orange-400 text-orange-400"
                    data-testid="button-search-untappd"
                  >
                    <Search className="w-4 h-4 mr-1" />
                    Search Untappd
                  </Button>
                </div>
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g., Stone IPA"
                  className="h-12 bg-[#0a2419] border-2 border-[#1A4D2E] text-white"
                  autoFocus
                  data-testid="input-product-name"
                />
              </div>

              {/* Selected Untappd Beer Preview */}
              {selectedUntappdBeer && (
                <Card className="bg-[#0a2419] border-2 border-green-500/50">
                  <CardContent className="p-3 flex items-center gap-3">
                    {newProductLabelUrl && (
                      <img 
                        src={newProductLabelUrl} 
                        alt={newProductName}
                        className="w-14 h-14 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">{newProductName}</p>
                      <div className="flex items-center gap-2 text-xs text-white/60">
                        {newProductAbv && <span>{newProductAbv}% ABV</span>}
                        {newProductIbu && <span>{newProductIbu} IBU</span>}
                        {newProductStyle && <span>{newProductStyle}</span>}
                      </div>
                      {newProductRating && (
                        <div className="flex items-center gap-1 mt-1">
                          <Star className="w-3 h-3 text-[#D4AF37] fill-[#D4AF37]" />
                          <span className="text-xs text-[#D4AF37]">{newProductRating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="border-green-400 text-green-400 text-xs">
                      Untappd
                    </Badge>
                  </CardContent>
                </Card>
              )}

              {/* Brand and Type Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white">Brand</Label>
                  <Input
                    value={newProductBrand}
                    onChange={(e) => setNewProductBrand(e.target.value)}
                    placeholder="e.g., Jack Daniels"
                    className="h-12 bg-[#0a2419] border-2 border-[#1A4D2E] text-white"
                    data-testid="input-brand"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Type</Label>
                  <Select
                    value={newProductBeverageType}
                    onValueChange={setNewProductBeverageType}
                  >
                    <SelectTrigger className="h-12 bg-[#0a2419] border-2 border-[#1A4D2E] text-white" data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                      <SelectItem value="beer" className="text-white">Beer</SelectItem>
                      <SelectItem value="spirits" className="text-white">Spirits</SelectItem>
                      <SelectItem value="wine" className="text-white">Wine</SelectItem>
                      <SelectItem value="cider" className="text-white">Cider</SelectItem>
                      <SelectItem value="na" className="text-white">N/A</SelectItem>
                      <SelectItem value="kombucha" className="text-white">Kombucha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Distributor</Label>
                <div className="grid grid-cols-2 gap-2">
                  {distributors.map((dist) => (
                    <Button
                      key={dist.id}
                      variant="outline"
                      onClick={() => setNewProductDistributor(dist.id)}
                      className={`
                        justify-start
                        ${newProductDistributor === dist.id 
                          ? "border-[#D4AF37] text-[#D4AF37]" 
                          : "border-[#1A4D2E] text-white/60"
                        }
                      `}
                      data-testid={`distributor-${dist.id}`}
                    >
                      {dist.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsKeg(!isKeg)}
                  className={`
                    flex-1
                    ${isKeg 
                      ? "border-[#D4AF37] text-[#D4AF37]" 
                      : "border-[#1A4D2E] text-white/60"
                    }
                  `}
                  data-testid="toggle-keg"
                >
                  <Beer className="w-4 h-4 mr-2" />
                  This is a Keg
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleCreateProduct}
                disabled={createProductMutation.isPending || !newProductName}
                className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
                data-testid="button-create-product"
              >
                {createProductMutation.isPending ? "Creating..." : "Save & Continue"}
              </Button>
              <Button
                variant="outline"
                onClick={resetToScanning}
                className="w-full border-[#1A4D2E] text-white/60"
                data-testid="button-skip"
              >
                Skip This Item
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Untappd Search Dialog */}
      <Dialog open={showUntappdSearch} onOpenChange={setShowUntappdSearch}>
        <DialogContent className="bg-[#0a2419] border-[#1A4D2E] max-w-md max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-orange-400" />
              Search Untappd
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={untappdSearchQuery}
                onChange={(e) => setUntappdSearchQuery(e.target.value)}
                placeholder="e.g., Stone IPA"
                className="flex-1 bg-[#051a11] border-[#1A4D2E] text-white"
                onKeyDown={(e) => e.key === "Enter" && handleUntappdSearch()}
                data-testid="input-untappd-search"
              />
              <Button
                onClick={handleUntappdSearch}
                disabled={untappdSearching || !untappdSearchQuery.trim()}
                className="bg-orange-500 text-white"
                data-testid="button-untappd-search-submit"
              >
                {untappdSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </Button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {untappdResults.length === 0 && !untappdSearching && (
                <p className="text-center text-white/40 py-4">
                  Enter a beer name to search
                </p>
              )}
              
              {untappdSearching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
                </div>
              )}

              {untappdResults.map((beer) => (
                <Card 
                  key={beer.id} 
                  className="bg-[#051a11] border-[#1A4D2E] cursor-pointer hover-elevate"
                  onClick={() => handleSelectUntappdBeer(beer)}
                  data-testid={`untappd-result-${beer.id}`}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    {beer.label && (
                      <img 
                        src={beer.label} 
                        alt={beer.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{beer.name}</p>
                      <p className="text-xs text-white/60 truncate">{beer.breweryName}</p>
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <span>{beer.abv}% ABV</span>
                        {beer.ibu > 0 && <span>{beer.ibu} IBU</span>}
                        <span className="truncate">{beer.style}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-[#D4AF37] fill-[#D4AF37]" />
                      <span className="text-[#D4AF37] font-medium">{beer.rating.toFixed(1)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
