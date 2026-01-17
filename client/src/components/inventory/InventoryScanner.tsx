import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera,
  List,
  Plus,
  AlertTriangle,
  Loader2,
  WifiOff,
  Beer,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PricingCalculator } from "@/components/pricing-calculator";
import type { Product } from "@shared/schema";

interface InventoryScannerProps {
  products: Product[];
  isOffline: boolean;
  onSelectProduct: (product: Product) => void;
  onFinishSession: () => void;
  countsSize: number;
}

const SCANNER_CONTAINER_ID = "qr-scanner-container";

export function InventoryScanner({
  products,
  isOffline,
  onSelectProduct,
  onFinishSession,
  countsSize,
}: InventoryScannerProps) {
  const { toast } = useToast();
  const [useCameraScanner, setUseCameraScanner] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Product creation state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductUpc, setNewProductUpc] = useState("");
  const [newProductSizeMl, setNewProductSizeMl] = useState("750");
  const [newProductBeverageType, setNewProductBeverageType] = useState("beer");
  const [upcLookupResult, setUpcLookupResult] = useState<{
    upc: string;
    title: string;
    brand?: string;
    size?: string;
  } | null>(null);

  const handleScannedCode = async (code: string) => {
    const normalizedCode = code.replace(/[-\s]/g, "");
    const existingProduct = products.find(
      (p) => p.upc && p.upc.replace(/[-\s]/g, "") === normalizedCode
    );

    if (existingProduct) {
      toast({ title: "Product found", description: existingProduct.name });
      onSelectProduct(existingProduct);
    } else {
      // Try UPC lookup
      setSearchQuery(normalizedCode);
      await lookupUpc(normalizedCode);
    }
  };

  const { scannerReady, cameraError } = useBarcodeScanner(
    useCameraScanner,
    SCANNER_CONTAINER_ID,
    handleScannedCode
  );

  const lookupUpc = async (upc: string) => {
    try {
      const response = await fetch(`/api/barcodespider/lookup/${upc}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setUpcLookupResult(data);
          setNewProductName(data.title || "");
          setNewProductUpc(data.upc || upc);
          if (data.size) {
            const mlMatch = data.size.match(/(\d+)\s*ml/i);
            const ozMatch = data.size.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
            const lMatch = data.size.match(/(\d+(?:\.\d+)?)\s*L/i);
            if (mlMatch) setNewProductSizeMl(mlMatch[1]);
            else if (ozMatch)
              setNewProductSizeMl(String(Math.round(parseFloat(ozMatch[1]) * 29.574)));
            else if (lMatch)
              setNewProductSizeMl(String(Math.round(parseFloat(lMatch[1]) * 1000)));
          }
          setShowAddProduct(true);
        } else {
          setNewProductUpc(upc);
          setNewProductName("");
          setShowAddProduct(true);
          toast({
            title: "New product",
            description: "UPC not in database - enter details",
          });
        }
      } else {
        setNewProductUpc(upc);
        setShowAddProduct(true);
      }
    } catch {
      setNewProductUpc(upc);
      setShowAddProduct(true);
    }
  };

  const cleanUpc = (query: string) => query.replace(/[-\s]/g, "");
  const isUpc = (query: string) => /^\d{8,14}$/.test(cleanUpc(query));

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const cleanedSearch = cleanUpc(searchQuery);
    return (
      p.name.toLowerCase().includes(q) ||
      (p.upc && cleanUpc(p.upc).includes(cleanedSearch)) ||
      (p.brand && p.brand.toLowerCase().includes(q))
    );
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    const cleanQuery = searchQuery.trim();
    const normalizedUpc = cleanUpc(cleanQuery);

    if (isUpc(cleanQuery)) {
      const existingProduct = products.find(
        (p) => p.upc && cleanUpc(p.upc) === normalizedUpc
      );
      if (existingProduct) {
        onSelectProduct(existingProduct);
        setSearchQuery("");
        return;
      }

      setIsSearching(true);
      try {
        await lookupUpc(normalizedUpc);
      } finally {
        setIsSearching(false);
      }
    } else {
      if (filteredProducts.length === 1) {
        onSelectProduct(filteredProducts[0]);
        setSearchQuery("");
      } else if (filteredProducts.length === 0) {
        setNewProductName(cleanQuery);
        setNewProductUpc("");
        setShowAddProduct(true);
      }
    }
  };

  const createProductMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      upc?: string;
      bottleSizeMl: number;
      beverageType: string;
    }) => {
      const response = await apiRequest("POST", "/api/products", {
        ...data,
        isSoldByVolume: false,
        parLevel: 2,
      });
      return response.json();
    },
    onSuccess: (newProduct) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product created", description: newProduct.name });
      onSelectProduct(newProduct);
      setShowAddProduct(false);
      setSearchQuery("");
      setNewProductName("");
      setNewProductUpc("");
      setUpcLookupResult(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const handleCreateProduct = () => {
    if (!newProductName.trim()) {
      toast({
        title: "Error",
        description: "Product name is required",
        variant: "destructive",
      });
      return;
    }
    const normalizedNewUpc = newProductUpc ? cleanUpc(newProductUpc) : undefined;
    createProductMutation.mutate({
      name: newProductName.trim(),
      upc: normalizedNewUpc || undefined,
      bottleSizeMl: parseInt(newProductSizeMl) || 750,
      beverageType: newProductBeverageType,
    });
  };

  return (
    <div className="space-y-4 pb-24">
      {isOffline && (
        <Card className="bg-orange-500/10 border-2 border-orange-500/50">
          <CardContent className="p-3 flex items-center gap-2">
            <WifiOff className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-orange-300">
              Offline - using cached products
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 mb-2">
        <Button
          variant={useCameraScanner ? "default" : "outline"}
          onClick={() => setUseCameraScanner(true)}
          className={
            useCameraScanner
              ? "flex-1 bg-[#D4AF37] text-[#051a11]"
              : "flex-1 border-[#1A4D2E] text-white/60"
          }
          data-testid="button-use-camera"
        >
          <Camera className="w-4 h-4 mr-2" />
          Camera
        </Button>
        <Button
          variant={!useCameraScanner ? "default" : "outline"}
          onClick={() => setUseCameraScanner(false)}
          className={
            !useCameraScanner
              ? "flex-1 bg-[#D4AF37] text-[#051a11]"
              : "flex-1 border-[#1A4D2E] text-white/60"
          }
          data-testid="button-use-text"
        >
          <List className="w-4 h-4 mr-2" />
          Type
        </Button>
      </div>

      {useCameraScanner ? (
        <Card className="bg-[#0a2419] border-2 border-[#D4AF37] overflow-hidden">
          <CardContent className="p-0">
            {cameraError ? (
              <div className="aspect-[4/3] bg-black flex flex-col items-center justify-center p-4">
                <AlertTriangle className="w-12 h-12 text-orange-400 mb-3" />
                <p className="text-orange-300 text-center text-sm mb-3">
                  {cameraError}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setUseCameraScanner(false)}
                  className="border-[#D4AF37] text-[#D4AF37]"
                >
                  Use Manual Entry
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div id={SCANNER_CONTAINER_ID} className="w-full aspect-[4/3]" />
                {!scannerReady && (
                  <div className="absolute inset-0 bg-black flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin mx-auto mb-2" />
                      <p className="text-white/60 text-sm">Starting camera...</p>
                    </div>
                  </div>
                )}
                {scannerReady && (
                  <div className="absolute bottom-2 left-0 right-0 text-center">
                    <Badge className="bg-green-500/80 text-white">
                      Point at barcode
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#0a2419] border-2 border-[#D4AF37]">
          <CardContent className="p-4 space-y-3">
            <Label className="text-[#D4AF37] font-medium">Search Product</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Type UPC or product name..."
                className="flex-1 bg-[#051a11] border-[#1A4D2E] text-white h-12 text-lg"
                autoFocus
                data-testid="input-scan-search"
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="h-12 px-6 bg-[#D4AF37] text-[#051a11]"
                data-testid="button-search-product"
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Go"}
              </Button>
            </div>
            <p className="text-xs text-white/40">
              Enter UPC barcode or start typing product name
            </p>
          </CardContent>
        </Card>
      )}

      {searchQuery && filteredProducts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-white/60">Matching products:</p>
          {filteredProducts.slice(0, 8).map((product) => (
            <Card
              key={product.id}
              className="bg-[#0a2419] border-[#1A4D2E] hover-elevate cursor-pointer"
              onClick={() => {
                onSelectProduct(product);
                setSearchQuery("");
              }}
              data-testid={`search-result-${product.id}`}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#1A4D2E] flex items-center justify-center flex-shrink-0">
                  {product.isSoldByVolume ? (
                    <Beer className="w-5 h-5 text-[#D4AF37]" />
                  ) : (
                    <Package className="w-5 h-5 text-[#D4AF37]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{product.name}</p>
                  <p className="text-xs text-white/40">
                    {product.upc || "No UPC"}
                    {product.bottleSizeMl ? ` - ${product.bottleSizeMl}ml` : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs border-[#1A4D2E] text-white/60 flex-shrink-0"
                >
                  {product.isSoldByVolume ? "Keg" : "Bottle"}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {filteredProducts.length > 8 && (
            <p className="text-center text-xs text-white/40">
              +{filteredProducts.length - 8} more results
            </p>
          )}
        </div>
      )}

      {searchQuery && filteredProducts.length === 0 && !isSearching && (
        <Card
          className="bg-[#0a2419] border-[#1A4D2E] border-dashed hover-elevate cursor-pointer"
          onClick={() => {
            if (isUpc(searchQuery)) {
              handleSearch();
            } else {
              setNewProductName(searchQuery);
              setNewProductUpc("");
              setShowAddProduct(true);
            }
          }}
          data-testid="button-add-new-product"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#D4AF37]/20 flex items-center justify-center">
              <Plus className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <p className="text-[#D4AF37] font-medium">Add New Product</p>
              <p className="text-xs text-white/40">
                {isUpc(searchQuery)
                  ? "Look up UPC and create product"
                  : `Create "${searchQuery}"`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent className="bg-[#0a2419] border-[#1A4D2E] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Add New Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {upcLookupResult && (
              <Card className="bg-[#051a11] border-[#1A4D2E]">
                <CardContent className="p-3">
                  <p className="text-xs text-white/40 mb-1">Found via UPC lookup:</p>
                  <p className="text-white font-medium">{upcLookupResult.title}</p>
                  {upcLookupResult.brand && (
                    <p className="text-sm text-white/60">{upcLookupResult.brand}</p>
                  )}
                </CardContent>
              </Card>
            )}
            <div className="space-y-2">
              <Label className="text-white">Product Name *</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g., Sierra Nevada Pale Ale"
                className="bg-[#051a11] border-[#1A4D2E] text-white"
                data-testid="input-new-product-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">UPC Code</Label>
              <Input
                value={newProductUpc}
                onChange={(e) => setNewProductUpc(e.target.value)}
                placeholder="12-digit barcode"
                className="bg-[#051a11] border-[#1A4D2E] text-white"
                data-testid="input-new-product-upc"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white">Size (ml)</Label>
                <Input
                  type="number"
                  value={newProductSizeMl}
                  onChange={(e) => setNewProductSizeMl(e.target.value)}
                  placeholder="750"
                  className="bg-[#051a11] border-[#1A4D2E] text-white"
                  data-testid="input-new-product-size"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Type</Label>
                <select
                  value={newProductBeverageType}
                  onChange={(e) => setNewProductBeverageType(e.target.value)}
                  className="w-full h-9 rounded-md bg-[#051a11] border border-[#1A4D2E] text-white px-3"
                  data-testid="select-new-product-type"
                >
                  <option value="beer">Beer</option>
                  <option value="cider">Cider</option>
                  <option value="wine">Wine</option>
                  <option value="spirits">Spirits</option>
                  <option value="na">N/A</option>
                  <option value="kombucha">Kombucha</option>
                </select>
              </div>
            </div>

            <PricingCalculator
              isSoldByVolume={newProductBeverageType !== "spirits"}
              beverageType={newProductBeverageType}
              bottleSizeMl={parseInt(newProductSizeMl) || 750}
            />

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddProduct(false);
                  setUpcLookupResult(null);
                }}
                className="flex-1 border-[#1A4D2E] text-white/60"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateProduct}
                disabled={createProductMutation.isPending || !newProductName.trim()}
                className="flex-1 bg-[#D4AF37] text-[#051a11]"
                data-testid="button-create-product"
              >
                {createProductMutation.isPending ? "Creating..." : "Create & Count"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E]">
        <Button
          onClick={onFinishSession}
          className="w-full h-14 bg-[#D4AF37] text-[#051a11] text-lg font-semibold"
          data-testid="button-finish-session-scan"
        >
          Finish Session ({countsSize} items counted)
        </Button>
      </div>
    </div>
  );
}
