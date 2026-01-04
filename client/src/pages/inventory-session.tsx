import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Camera, 
  List, 
  Scale, 
  Plus, 
  Minus, 
  Check,
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  WifiOff,
  Wifi,
  Settings,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Zone, Product, InventorySession } from "@shared/schema";

type Mode = "setup" | "list" | "scan" | "input" | "review";

interface CountData {
  productId: number;
  countedBottles: number;
  countedPartialOz: number | null;
  totalUnits: number;
  isManualEstimate: boolean;
  scaleWeightGrams: number | null;
}

interface OfflineCount {
  productId: number;
  productName: string;
  countedBottles: number;
  partialPercent: number;
  totalUnits: number;
  isManualEstimate: boolean;
  timestamp: number;
}

export default function InventorySessionPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<Mode>("setup");
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<InventorySession | null>(null);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [counts, setCounts] = useState<Map<number, CountData>>(new Map());
  
  // Scale state - persists for entire session
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleConnecting, setScaleConnecting] = useState(false);
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [isManualEstimate, setIsManualEstimate] = useState(true);
  
  // Quick scan mode - goes directly to scan after save
  const [quickScanMode, setQuickScanMode] = useState(true);
  
  // Empty weight editor
  const [showWeightEditor, setShowWeightEditor] = useState(false);
  const [editEmptyWeight, setEditEmptyWeight] = useState("");
  const [editFullWeight, setEditFullWeight] = useState("");
  
  // Offline mode
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlineCounts, setOfflineCounts] = useState<OfflineCount[]>([]);
  const [cachedProducts, setCachedProducts] = useState<Product[]>([]);
  
  const [fullBottles, setFullBottles] = useState(0);
  const [partialPercent, setPartialPercent] = useState([0]);

  // Calculate total units
  const totalUnits = fullBottles + (partialPercent[0] / 100);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast({
        title: "Back Online",
        description: "Syncing offline counts...",
      });
      syncOfflineCounts();
    };
    const handleOffline = () => {
      setIsOffline(true);
      toast({
        title: "Offline Mode",
        description: "Counts will be saved locally until connection returns",
        variant: "destructive",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load cached products on mount
  useEffect(() => {
    const cached = localStorage.getItem("wellstocked_products");
    if (cached) {
      setCachedProducts(JSON.parse(cached));
    }
    const savedOffline = localStorage.getItem("wellstocked_offline_counts");
    if (savedOffline) {
      setOfflineCounts(JSON.parse(savedOffline));
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/zones"],
    enabled: !isOffline,
  });

  const { data: products = [], isSuccess: productsLoaded } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: !isOffline,
  });

  // Cache products for offline use
  useEffect(() => {
    if (productsLoaded && products.length > 0) {
      localStorage.setItem("wellstocked_products", JSON.stringify(products));
      setCachedProducts(products);
    }
  }, [products, productsLoaded]);

  const displayProducts = isOffline ? cachedProducts : products;

  const syncOfflineCounts = useCallback(async () => {
    if (offlineCounts.length === 0 || !activeSession) return;
    
    for (const count of offlineCounts) {
      try {
        const partialOz = count.partialPercent > 0 
          ? (count.partialPercent / 100) * (displayProducts.find(p => p.id === count.productId)?.bottleSizeMl || 750) / 29.574 
          : null;
        
        await apiRequest("POST", "/api/inventory/counts", {
          sessionId: activeSession.id,
          productId: count.productId,
          countedBottles: count.countedBottles,
          countedPartialOz: partialOz,
          isManualEstimate: count.isManualEstimate,
        });
      } catch (e) {
        console.error("Failed to sync count:", e);
      }
    }
    
    setOfflineCounts([]);
    localStorage.removeItem("wellstocked_offline_counts");
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    
    toast({
      title: "Sync Complete",
      description: `${offlineCounts.length} counts synced`,
    });
  }, [offlineCounts, activeSession, displayProducts]);

  const startSessionMutation = useMutation({
    mutationFn: async (zoneId: number) => {
      const res = await fetch("/api/inventory/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ zoneId }),
      });
      const data = await res.json();
      
      if (data.session) {
        return data.session;
      }
      if (!res.ok) {
        throw new Error(data.error || "Failed to start session");
      }
      return data;
    },
    onSuccess: (session: InventorySession) => {
      setActiveSession(session);
      setSelectedZone(session.zoneId);
      setMode(quickScanMode ? "scan" : "list");
      
      toast({
        title: "Session Active",
        description: `Counting in ${zones.find(z => z.id === session.zoneId)?.name || "zone"}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveCountMutation = useMutation({
    mutationFn: async (data: { 
      sessionId: number; 
      productId: number; 
      countedBottles: number; 
      countedPartialOz: number | null;
      isManualEstimate: boolean;
      scaleWeightGrams: number | null;
    }) => {
      const res = await apiRequest("POST", "/api/inventory/counts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const updateProductWeightMutation = useMutation({
    mutationFn: async (data: { productId: number; emptyWeightGrams: number; fullWeightGrams: number }) => {
      const res = await apiRequest("PATCH", `/api/products/${data.productId}`, {
        emptyWeightGrams: data.emptyWeightGrams,
        fullWeightGrams: data.fullWeightGrams,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setShowWeightEditor(false);
      toast({
        title: "Weight Updated",
        description: "Empty and full weights saved",
      });
    },
  });

  const finishSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await apiRequest("PATCH", `/api/inventory/sessions/${sessionId}`, { status: "completed" });
      return res.json();
    },
    onSuccess: () => {
      setLocation("/dashboard");
    },
  });

  const handleConnectScale = async () => {
    setScaleConnecting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setScaleConnected(true);
    setScaleConnecting(false);
    
    toast({
      title: "Scale Connected",
      description: "Bluetooth scale ready for the session",
    });
  };

  const handleStartSession = () => {
    if (selectedZone) {
      startSessionMutation.mutate(selectedZone);
    }
  };

  const handleSelectProduct = (product: Product) => {
    setCurrentProduct(product);
    setFullBottles(0);
    setPartialPercent([0]);
    setScaleWeight(null);
    setIsManualEstimate(true);
    setEditEmptyWeight(product.emptyWeightGrams?.toString() || "");
    setEditFullWeight(product.fullWeightGrams?.toString() || "");
    setMode("input");
    
    // Auto-weigh if scale connected
    if (scaleConnected) {
      setTimeout(() => simulateScaleReading(product), 500);
    }
  };

  const handleSaveCount = () => {
    if (!currentProduct) return;
    
    const partialOz = partialPercent[0] > 0 
      ? (partialPercent[0] / 100) * (currentProduct.bottleSizeMl || 750) / 29.574 
      : null;
    
    const countData: CountData = {
      productId: currentProduct.id,
      countedBottles: fullBottles,
      countedPartialOz: partialOz,
      totalUnits: totalUnits,
      isManualEstimate: isManualEstimate,
      scaleWeightGrams: scaleWeight,
    };
    
    setCounts(new Map(counts.set(currentProduct.id, countData)));
    
    if (isOffline) {
      const offlineCount: OfflineCount = {
        productId: currentProduct.id,
        productName: currentProduct.name,
        countedBottles: fullBottles,
        partialPercent: partialPercent[0],
        totalUnits: totalUnits,
        isManualEstimate: isManualEstimate,
        timestamp: Date.now(),
      };
      const newOfflineCounts = [...offlineCounts, offlineCount];
      setOfflineCounts(newOfflineCounts);
      localStorage.setItem("wellstocked_offline_counts", JSON.stringify(newOfflineCounts));
      
      toast({
        title: "Saved Offline",
        description: `${currentProduct.name}: ${totalUnits.toFixed(1)} units`,
      });
    } else if (activeSession) {
      saveCountMutation.mutate({
        sessionId: activeSession.id,
        productId: currentProduct.id,
        countedBottles: fullBottles,
        countedPartialOz: partialOz,
        isManualEstimate: isManualEstimate,
        scaleWeightGrams: scaleWeight,
      });
    }
    
    setCurrentProduct(null);
    
    // Quick scan mode: go directly to scan, otherwise list
    if (quickScanMode) {
      setMode("scan");
    } else {
      setMode("list");
    }
  };

  const handleFinishSession = () => {
    setMode("review");
  };

  const handleSubmitSession = async () => {
    if (offlineCounts.length > 0 && !isOffline) {
      await syncOfflineCounts();
    }
    
    if (activeSession) {
      finishSessionMutation.mutate(activeSession.id);
    }
  };

  const handleSaveWeights = () => {
    if (!currentProduct) return;
    
    updateProductWeightMutation.mutate({
      productId: currentProduct.id,
      emptyWeightGrams: parseInt(editEmptyWeight) || 0,
      fullWeightGrams: parseInt(editFullWeight) || 0,
    });
  };

  const simulateScaleReading = (product?: Product) => {
    if (!scaleConnected) return;
    
    const targetProduct = product || currentProduct;
    if (!targetProduct) return;
    
    const weight = Math.floor(Math.random() * 700) + 100;
    setScaleWeight(weight);
    setIsManualEstimate(false);
    
    // Calculate percentage based on empty/full weights if available
    const emptyWeight = targetProduct.emptyWeightGrams || 200;
    const fullWeight = targetProduct.fullWeightGrams || (targetProduct.bottleSizeMl || 750) + 200;
    const liquidWeight = fullWeight - emptyWeight;
    const currentLiquid = Math.max(0, weight - emptyWeight);
    const percentFull = Math.min(100, Math.round((currentLiquid / liquidWeight) * 100));
    
    setPartialPercent([percentFull]);
    
    toast({
      title: `${weight}g`,
      description: `${percentFull}% full (scale reading)`,
    });
  };

  const handleManualSliderChange = (value: number[]) => {
    setPartialPercent(value);
    setIsManualEstimate(true);
    setScaleWeight(null);
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
              if (mode === "input") {
                setMode(quickScanMode ? "scan" : "list");
                setCurrentProduct(null);
              } else if (mode === "list" || mode === "scan") {
                setMode("setup");
              } else if (mode === "review") {
                setMode("list");
              } else {
                setLocation("/dashboard");
              }
            }}
            className="text-white/60"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">
              {mode === "setup" && "Start Count"}
              {mode === "list" && "Select Item"}
              {mode === "scan" && "Quick Scan"}
              {mode === "input" && "Count Item"}
              {mode === "review" && "Review Session"}
            </h1>
            {activeSession && (
              <p className="text-sm text-white/60">
                {zones.find(z => z.id === activeSession.zoneId)?.name}
              </p>
            )}
          </div>
          
          {/* Status indicators */}
          <div className="flex items-center gap-2">
            {quickScanMode && mode !== "setup" && (
              <Badge variant="outline" className="border-[#D4AF37] text-[#D4AF37]">
                <Zap className="w-3 h-3 mr-1" />
                Quick
              </Badge>
            )}
            {isOffline ? (
              <Badge variant="outline" className="border-orange-500 text-orange-400">
                <WifiOff className="w-3 h-3 mr-1" />
                Offline
              </Badge>
            ) : (
              <Wifi className="w-4 h-4 text-green-400" />
            )}
            {scaleConnected && (
              <BluetoothConnected className="w-4 h-4 text-blue-400" />
            )}
          </div>
        </div>
      </header>

      <main className="p-4">
        {/* SETUP MODE */}
        {mode === "setup" && (
          <div className="space-y-6">
            {/* Quick Scan Toggle */}
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className={`w-6 h-6 ${quickScanMode ? "text-[#D4AF37]" : "text-white/40"}`} />
                    <div>
                      <p className="font-medium text-white">Quick Scan Mode</p>
                      <p className="text-sm text-white/60">
                        Auto-open camera after each save
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={quickScanMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQuickScanMode(!quickScanMode)}
                    className={quickScanMode 
                      ? "bg-[#D4AF37] text-[#051a11]" 
                      : "border-[#1A4D2E] text-white/60"
                    }
                    data-testid="toggle-quick-scan"
                  >
                    {quickScanMode ? "ON" : "OFF"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Scale Connection */}
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {scaleConnected ? (
                      <BluetoothConnected className="w-6 h-6 text-blue-400" />
                    ) : (
                      <Bluetooth className="w-6 h-6 text-white/40" />
                    )}
                    <div>
                      <p className="font-medium text-white">Bluetooth Scale</p>
                      <p className="text-sm text-white/60">
                        {scaleConnected ? "Connected - auto-weighs on scan" : "For partial bottles"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={scaleConnected ? "outline" : "default"}
                    size="sm"
                    onClick={handleConnectScale}
                    disabled={scaleConnected || scaleConnecting}
                    className={scaleConnected 
                      ? "border-blue-400 text-blue-400" 
                      : "bg-[#1A4D2E] text-[#D4AF37]"
                    }
                    data-testid="button-connect-scale"
                  >
                    {scaleConnecting ? "..." : scaleConnected ? "Connected" : "Connect"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div>
              <h2 className="text-lg font-medium text-white mb-4">Select Zone</h2>
              <div className="grid grid-cols-2 gap-3">
                {zones.map((zone) => (
                  <Card
                    key={zone.id}
                    onClick={() => setSelectedZone(zone.id)}
                    className={`
                      bg-[#0a2419] border-2 cursor-pointer overflow-visible
                      ${selectedZone === zone.id 
                        ? "border-[#D4AF37]" 
                        : "border-[#1A4D2E] hover-elevate"
                      }
                    `}
                    data-testid={`zone-${zone.id}`}
                  >
                    <CardContent className="p-4">
                      <p className="font-medium text-white">{zone.name}</p>
                      {zone.description && (
                        <p className="text-sm text-white/60">{zone.description}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {isOffline && (
              <Card className="bg-orange-500/10 border-2 border-orange-500/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <WifiOff className="w-6 h-6 text-orange-400" />
                  <div>
                    <p className="font-medium text-orange-300">Offline Mode Active</p>
                    <p className="text-sm text-orange-200/70">
                      Counts will sync when connection returns
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button
              onClick={handleStartSession}
              disabled={!selectedZone || startSessionMutation.isPending || isOffline}
              className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
              data-testid="button-start-count"
            >
              {startSessionMutation.isPending ? "Starting..." : quickScanMode ? "Start Quick Scan" : "Start Count"}
            </Button>
          </div>
        )}

        {/* LIST MODE */}
        {mode === "list" && (
          <div className="space-y-4 pb-24">
            <div className="flex gap-2 mb-4">
              <Button
                variant="outline"
                onClick={() => setMode("list")}
                className="flex-1 border-[#D4AF37] text-[#D4AF37]"
                data-testid="button-list-mode"
              >
                <List className="w-4 h-4 mr-2" />
                List
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode("scan")}
                className="flex-1 border-[#1A4D2E] text-white/60"
                data-testid="button-scan-mode"
              >
                <Camera className="w-4 h-4 mr-2" />
                Scan
              </Button>
            </div>

            <div className="space-y-2">
              {displayProducts.map((product) => {
                const counted = counts.has(product.id);
                const countData = counts.get(product.id);
                return (
                  <Card
                    key={product.id}
                    onClick={() => handleSelectProduct(product)}
                    className={`
                      bg-[#0a2419] border-2 cursor-pointer overflow-visible
                      ${counted ? "border-green-500/50" : "border-[#1A4D2E] hover-elevate"}
                    `}
                    data-testid={`product-${product.id}`}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      {product.labelImageUrl ? (
                        <img 
                          src={product.labelImageUrl} 
                          alt={product.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                          <span className="text-[#D4AF37] text-lg font-bold">
                            {product.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-white">{product.name}</p>
                        <p className="text-sm text-white/60">
                          {product.bottleSizeMl ? `${product.bottleSizeMl}ml` : ""}
                          {product.style ? ` - ${product.style}` : ""}
                        </p>
                      </div>
                      {counted && countData && (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`
                            ${countData.isManualEstimate 
                              ? "border-orange-400 text-orange-400" 
                              : "border-blue-400 text-blue-400"
                            }
                          `}>
                            {countData.totalUnits.toFixed(1)}
                            {countData.isManualEstimate ? "" : " (S)"}
                          </Badge>
                          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Check className="w-3 h-3 text-green-400" />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E]">
              <Button
                onClick={handleFinishSession}
                className="w-full h-14 bg-[#D4AF37] text-[#051a11] text-lg font-semibold"
                data-testid="button-finish-session"
              >
                Finish Session ({counts.size} items counted)
              </Button>
            </div>
          </div>
        )}

        {/* SCAN MODE */}
        {mode === "scan" && (
          <div className="space-y-4 pb-24">
            <div className="flex gap-2 mb-4">
              <Button
                variant="outline"
                onClick={() => setMode("list")}
                className="flex-1 border-[#1A4D2E] text-white/60"
                data-testid="button-list-mode-2"
              >
                <List className="w-4 h-4 mr-2" />
                List
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode("scan")}
                className="flex-1 border-[#D4AF37] text-[#D4AF37]"
                data-testid="button-scan-mode-2"
              >
                <Camera className="w-4 h-4 mr-2" />
                Scan
              </Button>
            </div>

            {isOffline && (
              <Card className="bg-orange-500/10 border-2 border-orange-500/50">
                <CardContent className="p-3 flex items-center gap-2">
                  <WifiOff className="w-5 h-5 text-orange-400" />
                  <span className="text-sm text-orange-300">Offline - using cached products</span>
                </CardContent>
              </Card>
            )}

            <Card className="bg-[#0a2419] border-2 border-[#D4AF37] overflow-hidden">
              <CardContent className="p-0">
                <div className="aspect-[4/3] bg-black flex items-center justify-center relative">
                  <div className="absolute inset-0 border-4 border-[#D4AF37]/30 m-8 rounded-lg" />
                  <div className="text-center text-white/60 z-10">
                    <Camera className="w-16 h-16 mx-auto mb-2 text-[#D4AF37]" />
                    <p className="text-[#D4AF37] font-medium">Camera Active</p>
                    <p className="text-sm">Scan barcode to count</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {scaleConnected && (
              <p className="text-center text-blue-400 text-sm flex items-center justify-center gap-2">
                <BluetoothConnected className="w-4 h-4" />
                Scale will auto-weigh on scan
              </p>
            )}

            {/* Simulation buttons */}
            <div className="grid grid-cols-2 gap-2">
              {displayProducts.slice(0, 6).map((product) => (
                <Button
                  key={product.id}
                  variant="outline"
                  onClick={() => handleSelectProduct(product)}
                  className="text-sm border-[#1A4D2E] text-white/80 justify-start"
                  data-testid={`scan-${product.id}`}
                >
                  {product.name.substring(0, 15)}
                </Button>
              ))}
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E]">
              <Button
                onClick={handleFinishSession}
                className="w-full h-14 bg-[#D4AF37] text-[#051a11] text-lg font-semibold"
                data-testid="button-finish-session-scan"
              >
                Finish Session ({counts.size} items counted)
              </Button>
            </div>
          </div>
        )}

        {/* INPUT MODE */}
        {mode === "input" && currentProduct && (
          <div className="space-y-4 pb-36">
            {/* Product Card */}
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4 flex items-center gap-4">
                {currentProduct.labelImageUrl ? (
                  <img 
                    src={currentProduct.labelImageUrl} 
                    alt={currentProduct.name}
                    className="w-14 h-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                    <span className="text-[#D4AF37] text-xl font-bold">
                      {currentProduct.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-white">{currentProduct.name}</p>
                  <p className="text-sm text-white/60">
                    {currentProduct.bottleSizeMl}ml - {currentProduct.style}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowWeightEditor(true)}
                  className="text-white/40"
                  data-testid="button-edit-weights"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </CardContent>
            </Card>

            {/* Partial Bottle with Scale */}
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-[#D4AF37]" />
                    <span className="text-white font-medium">Open/Partial Bottle</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isManualEstimate && scaleWeight && (
                      <Badge variant="outline" className="border-blue-400 text-blue-400">
                        {scaleWeight}g (Scale)
                      </Badge>
                    )}
                    {isManualEstimate && partialPercent[0] > 0 && (
                      <Badge variant="outline" className="border-orange-400 text-orange-400">
                        Manual
                      </Badge>
                    )}
                    {scaleConnected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => simulateScaleReading()}
                        className="border-blue-400 text-blue-400"
                        data-testid="button-weigh"
                      >
                        <BluetoothConnected className="w-4 h-4 mr-1" />
                        Weigh
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-white/60 mb-2">
                      <span>Empty</span>
                      <span className={`font-medium ${isManualEstimate ? "text-orange-400" : "text-blue-400"}`}>
                        {partialPercent[0]}%
                      </span>
                      <span>Full</span>
                    </div>
                    <Slider
                      value={partialPercent}
                      onValueChange={handleManualSliderChange}
                      max={100}
                      step={5}
                      className="w-full"
                      data-testid="slider-partial"
                    />
                    <p className="text-center text-sm text-white/40 mt-2">
                      = {(partialPercent[0] / 100).toFixed(2)} units
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Full Bottles Stepper */}
            <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
              <CardContent className="p-4">
                <p className="text-white font-medium mb-4">Full Sealed Bottles/Cans</p>
                <div className="flex items-center justify-center gap-6">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFullBottles(Math.max(0, fullBottles - 1))}
                    className="w-14 h-14 border-[#1A4D2E] text-white"
                    data-testid="button-minus"
                  >
                    <Minus className="w-6 h-6" />
                  </Button>
                  <span 
                    className="text-4xl font-bold text-[#D4AF37] w-20 text-center"
                    data-testid="text-full-bottles"
                  >
                    {fullBottles}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFullBottles(fullBottles + 1)}
                    className="w-14 h-14 border-[#1A4D2E] text-white"
                    data-testid="button-plus"
                  >
                    <Plus className="w-6 h-6" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Fixed Bottom: Total + Save Button */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#051a11] border-t border-[#1A4D2E]">
              {/* Total Units Display */}
              <div className="px-4 py-3 border-b border-[#1A4D2E]/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60">Total</span>
                    {!isManualEstimate && (
                      <Badge variant="outline" className="border-blue-400 text-blue-400 text-xs">
                        Scale
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-[#D4AF37]" data-testid="text-total-units">
                      {totalUnits.toFixed(1)}
                    </span>
                    <span className="text-white/40 text-sm">
                      ({fullBottles} + {(partialPercent[0] / 100).toFixed(1)})
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Save Button */}
              <div className="p-4">
                <Button
                  onClick={handleSaveCount}
                  disabled={saveCountMutation.isPending}
                  className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
                  data-testid="button-save-next"
                >
                  {saveCountMutation.isPending ? "Saving..." : (
                    <>
                      Save & {quickScanMode ? "Scan Next" : "Continue"}
                      {quickScanMode && <Camera className="w-5 h-5 ml-2" />}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* REVIEW MODE */}
        {mode === "review" && (
          <div className="space-y-4 pb-24">
            <h2 className="text-lg font-medium text-white">Variance Report</h2>
            
            {offlineCounts.length > 0 && (
              <Card className="bg-orange-500/10 border-2 border-orange-500/50">
                <CardContent className="p-3">
                  <p className="text-sm text-orange-300">
                    {offlineCounts.length} counts saved offline - will sync when online
                  </p>
                </CardContent>
              </Card>
            )}
            
            {Array.from(counts.entries()).map(([productId, count]) => {
              const product = displayProducts.find(p => p.id === productId);
              if (!product) return null;
              
              const expected = product.currentCountBottles || 0;
              const variance = count.totalUnits - expected;
              const isLargeVariance = Math.abs(variance) > 2;
              
              return (
                <Card 
                  key={productId}
                  className={`bg-[#0a2419] border-2 ${isLargeVariance ? "border-red-500" : "border-[#1A4D2E]"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">{product.name}</p>
                          <Badge variant="outline" className={`text-xs ${
                            count.isManualEstimate 
                              ? "border-orange-400 text-orange-400" 
                              : "border-blue-400 text-blue-400"
                          }`}>
                            {count.isManualEstimate ? "Manual" : "Scale"}
                          </Badge>
                        </div>
                        <p className="text-sm text-white/60">
                          Expected: {expected.toFixed(1)} | Counted: {count.totalUnits.toFixed(1)}
                        </p>
                      </div>
                      <div className={`text-right ${isLargeVariance ? "text-red-400" : "text-white/60"}`}>
                        {isLargeVariance && <AlertTriangle className="w-5 h-5 inline mr-1" />}
                        <span className="font-medium">
                          {variance > 0 ? "+" : ""}{variance.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E]">
              <Button
                onClick={handleSubmitSession}
                disabled={finishSessionMutation.isPending}
                className="w-full h-14 bg-[#D4AF37] text-[#051a11] text-lg font-semibold"
                data-testid="button-submit-session"
              >
                {finishSessionMutation.isPending ? "Submitting..." : "Finish Session"}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Weight Editor Dialog */}
      <Dialog open={showWeightEditor} onOpenChange={setShowWeightEditor}>
        <DialogContent className="bg-[#0a2419] border-[#1A4D2E] text-white">
          <DialogHeader>
            <DialogTitle>Edit Bottle Weights</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-white/60">
              Set empty and full weights for more accurate scale readings.
            </p>
            <div className="space-y-2">
              <Label className="text-white">Empty Weight (grams)</Label>
              <Input
                type="number"
                value={editEmptyWeight}
                onChange={(e) => setEditEmptyWeight(e.target.value)}
                placeholder="e.g., 200"
                className="bg-[#051a11] border-[#1A4D2E] text-white"
                data-testid="input-empty-weight"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Full Weight (grams)</Label>
              <Input
                type="number"
                value={editFullWeight}
                onChange={(e) => setEditFullWeight(e.target.value)}
                placeholder="e.g., 950"
                className="bg-[#051a11] border-[#1A4D2E] text-white"
                data-testid="input-full-weight"
              />
            </div>
            <Button
              onClick={handleSaveWeights}
              disabled={updateProductWeightMutation.isPending}
              className="w-full bg-[#1A4D2E] text-[#D4AF37] border border-[#D4AF37]"
              data-testid="button-save-weights"
            >
              {updateProductWeightMutation.isPending ? "Saving..." : "Save Weights"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
