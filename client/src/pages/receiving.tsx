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
import { 
  ArrowLeft, 
  Camera, 
  Check,
  Plus,
  Package,
  Beer,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Product, Distributor } from "@shared/schema";

type Mode = "scanning" | "known_product" | "new_product";

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
    mutationFn: async (data: { name: string; upc: string; distributorId: number | null }) => {
      const res = await apiRequest("POST", "/api/products", data);
      return res.json();
    },
    onSuccess: (product: Product) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setFoundProduct(product);
      setMode("known_product");
    },
  });

  const lookupProduct = async (upc: string) => {
    try {
      const res = await fetch(`/api/products/upc/${upc}`);
      const product = await res.json();
      
      if (product) {
        setFoundProduct(product);
        setIsKeg(product.isSoldByVolume || false);
        setMode("known_product");
        
        // Play success sound simulation
        toast({
          title: product.name,
          description: product.isSoldByVolume ? "Keg detected" : "Enter quantity",
        });
      } else {
        setMode("new_product");
        toast({
          title: "New Item Found",
          description: "Please enter product details",
        });
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
                <Label className="text-white">Product Name</Label>
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g., Grey Goose Vodka 750ml"
                  className="h-12 bg-[#0a2419] border-2 border-[#1A4D2E] text-white"
                  autoFocus
                  data-testid="input-product-name"
                />
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
    </div>
  );
}
