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
  Zap,
  Beer,
  Package,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Zone, Product, InventorySession } from "@shared/schema";

type Mode = "setup" | "list" | "scan" | "input" | "review" | "view-completed";

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
  bottleSizeMl: number;
  isKeg: boolean;
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
  const [backupCount, setBackupCount] = useState(0);
  const [coolerStock, setCoolerStock] = useState(0);
  const [kegSummary, setKegSummary] = useState<{
    tapped: Array<{
      kegId: number;
      tapNumber: number | null;
      remainingPercent: number;
    }>;
    onDeckCount: number;
    totalKegEquivalent: number;
  } | null>(null);
  
  // View completed session state
  const [viewSessionId, setViewSessionId] = useState<number | null>(null);
  const [viewSessionData, setViewSessionData] = useState<{
    session: InventorySession;
    counts: Array<{
      id: number;
      productId: number;
      countedBottles: number;
      countedPartialOz: number | null;
      isManualEstimate: boolean;
    }>;
  } | null>(null);
  
  // Auto-start zone from URL param
  const [autoStartZone, setAutoStartZone] = useState<number | null>(null);

  // Calculate total units - differs for bottles vs kegs
  const getTotalUnits = () => {
    if (currentProduct?.isSoldByVolume) {
      // Kegs: sum of tapped remaining + cooler stock
      if (kegSummary === null) {
        // Still loading - return 0 to prevent incorrect bottle math
        return 0;
      }
      const tappedTotal = kegSummary.tapped.reduce((sum, k) => sum + k.remainingPercent, 0);
      return tappedTotal + coolerStock;
    } else {
      // Bottles: partial open + backup sealed count
      return (partialPercent[0] / 100) + backupCount;
    }
  };
  const totalUnits = getTotalUnits();

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

  // Parse URL params for zone or view mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zoneParam = params.get("zone");
    const viewParam = params.get("view");
    
    if (viewParam) {
      const sessionId = parseInt(viewParam);
      if (!isNaN(sessionId)) {
        setViewSessionId(sessionId);
        setMode("view-completed");
        // Fetch the session data
        fetch(`/api/inventory/sessions/${sessionId}`, { credentials: "include" })
          .then(res => res.json())
          .then(data => {
            if (data.session) {
              setViewSessionData(data);
            }
          })
          .catch(console.error);
      }
    } else if (zoneParam) {
      const zoneId = parseInt(zoneParam);
      if (!isNaN(zoneId)) {
        setAutoStartZone(zoneId);
      }
    }
  }, []);

  // Auto-start session when zone param is provided
  useEffect(() => {
    if (autoStartZone && isAuthenticated && !authLoading && mode === "setup") {
      startSessionMutation.mutate(autoStartZone);
      setAutoStartZone(null); // Clear so we don't retry
    }
  }, [autoStartZone, isAuthenticated, authLoading, mode]);

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
        // Use cached bottle size from the offline count for accurate conversion
        const bottleSizeMl = count.bottleSizeMl || 750;
        const isKeg = count.isKeg || false;
        
        // Send partial value in milliliters (consistent with live saves)
        const partialMl = !isKeg && count.partialPercent > 0 
          ? (count.partialPercent / 100) * bottleSizeMl
          : null;
        
        await apiRequest("POST", "/api/inventory/counts", {
          sessionId: activeSession.id,
          productId: count.productId,
          countedBottles: count.countedBottles,
          countedPartialOz: partialMl, // Note: field name is legacy, value is actually in ml
          isManualEstimate: count.isManualEstimate,
          isKeg: isKeg,
        });
      } catch (e) {
        console.error("Failed to sync count:", e);
      }
    }
    
    setOfflineCounts([]);
    localStorage.removeItem("wellstocked_offline_counts");
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/kegs"] });
    
    toast({
      title: "Sync Complete",
      description: `${offlineCounts.length} counts synced`,
    });
  }, [offlineCounts, activeSession]);

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
        duration: 2000,
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
      isKeg: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/inventory/counts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kegs"] });
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

  const handleSelectProduct = async (product: Product) => {
    setCurrentProduct(product);
    setFullBottles(0);
    setPartialPercent([0]);
    setScaleWeight(null);
    setIsManualEstimate(true);
    setEditEmptyWeight(product.emptyWeightGrams?.toString() || "");
    setEditFullWeight(product.fullWeightGrams?.toString() || "");
    
    // Initialize backup count from product data
    setBackupCount(product.backupCount || 0);
    
    // For kegs, fetch the keg summary
    if (product.isSoldByVolume) {
      setKegSummary(null);
      try {
        const res = await fetch(`/api/kegs/product/${product.id}/summary`, { credentials: "include" });
        const summary = await res.json();
        setKegSummary(summary);
        setCoolerStock(summary.onDeckCount || 0);
      } catch (error) {
        console.error("Failed to fetch keg summary:", error);
      }
    } else {
      setKegSummary(null);
      setCoolerStock(0);
    }
    
    setMode("input");
    
    // Auto-weigh if scale connected (only for bottles)
    if (scaleConnected && !product.isSoldByVolume) {
      setTimeout(() => simulateScaleReading(product), 500);
    }
  };

  const handleSaveCount = () => {
    if (!currentProduct) return;
    
    const isKeg = !!currentProduct.isSoldByVolume;
    
    // For kegs, prevent saving until keg summary is loaded
    if (isKeg && kegSummary === null) {
      toast({
        title: "Loading",
        description: "Please wait for keg data to load",
        variant: "destructive",
      });
      return;
    }
    
    // For bottles: partial is in oz (converted from percentage)
    // For kegs: no partial oz (kegs use remaining % from PMB)
    const partialOz = !isKeg && partialPercent[0] > 0 
      ? (partialPercent[0] / 100) * (currentProduct.bottleSizeMl || 750)
      : null;
    
    // For bottles: countedBottles = backupCount (sealed units)
    // For kegs: countedBottles = coolerStock (on_deck kegs in cooler)
    const countedUnits = isKeg ? coolerStock : backupCount;
    
    const countData: CountData = {
      productId: currentProduct.id,
      countedBottles: countedUnits,
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
        countedBottles: countedUnits,
        partialPercent: partialPercent[0],
        totalUnits: totalUnits,
        isManualEstimate: isManualEstimate,
        timestamp: Date.now(),
        bottleSizeMl: currentProduct.bottleSizeMl || 750,
        isKeg: isKeg,
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
        countedBottles: countedUnits,
        countedPartialOz: partialOz,
        isManualEstimate: isManualEstimate,
        scaleWeightGrams: scaleWeight,
        isKeg: isKeg,
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
              } else if (mode === "view-completed") {
                setLocation("/inventory-dashboard");
              } else {
                setLocation("/inventory-dashboard");
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
              {mode === "view-completed" && "Completed Inventory"}
            </h1>
            {activeSession && (mode === "list" || mode === "scan" || mode === "input") && (
              <div className="flex items-center gap-2">
                <Badge className="bg-[#1A4D2E] text-[#D4AF37] border-none text-sm px-3">
                  {zones.find(z => z.id === activeSession.zoneId)?.name}
                </Badge>
              </div>
            )}
            {mode === "view-completed" && viewSessionData && (
              <p className="text-sm text-white/60">
                {zones.find(z => z.id === viewSessionData.session.zoneId)?.name} - {
                  viewSessionData.session.completedAt 
                    ? new Date(viewSessionData.session.completedAt).toLocaleDateString()
                    : ""
                }
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
                    {currentProduct.isSoldByVolume ? (
                      <Beer className="w-7 h-7 text-[#D4AF37]" />
                    ) : (
                      <span className="text-[#D4AF37] text-xl font-bold">
                        {currentProduct.name.charAt(0)}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">{currentProduct.name}</p>
                    <Badge variant="outline" className={`text-xs ${currentProduct.isSoldByVolume ? "border-blue-400 text-blue-400" : "border-green-400 text-green-400"}`}>
                      {currentProduct.isSoldByVolume ? "Keg" : "Bottle"}
                    </Badge>
                  </div>
                  <p className="text-sm text-white/60">
                    {currentProduct.isSoldByVolume ? "Draft Beer" : `${currentProduct.bottleSizeMl}ml`}
                    {currentProduct.style ? ` - ${currentProduct.style}` : ""}
                  </p>
                </div>
                {!currentProduct.isSoldByVolume && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowWeightEditor(true)}
                    className="text-white/40"
                    data-testid="button-edit-weights"
                  >
                    <Settings className="w-5 h-5" />
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* BOTTLE INTERFACE */}
            {!currentProduct.isSoldByVolume && (
              <>
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
                            {scaleWeight}g
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

                {/* Sealed Bottles Stepper (Backup Count) */}
                <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Package className="w-5 h-5 text-[#D4AF37]" />
                      <span className="text-white font-medium">Sealed Backup</span>
                    </div>
                    <div className="flex items-center justify-center gap-6">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setBackupCount(Math.max(0, backupCount - 1))}
                        className="w-14 h-14 border-[#1A4D2E] text-white"
                        data-testid="button-backup-minus"
                      >
                        <Minus className="w-6 h-6" />
                      </Button>
                      <span 
                        className="text-4xl font-bold text-[#D4AF37] w-20 text-center"
                        data-testid="text-backup-count"
                      >
                        {backupCount}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setBackupCount(backupCount + 1)}
                        className="w-14 h-14 border-[#1A4D2E] text-white"
                        data-testid="button-backup-plus"
                      >
                        <Plus className="w-6 h-6" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* KEG INTERFACE */}
            {currentProduct.isSoldByVolume && (
              <>
                {/* Tapped Kegs Display (Read-Only) */}
                <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Beer className="w-5 h-5 text-[#D4AF37]" />
                      <span className="text-white font-medium">On Tap</span>
                      <Badge variant="outline" className="border-white/40 text-white/40 text-xs ml-auto">
                        Read Only (from PMB)
                      </Badge>
                    </div>
                    
                    {kegSummary === null ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin" />
                      </div>
                    ) : kegSummary.tapped.length === 0 ? (
                      <p className="text-white/40 text-center py-4">No kegs currently tapped</p>
                    ) : (
                      <div className="space-y-2">
                        {kegSummary.tapped.map((keg) => (
                          <div 
                            key={keg.kegId}
                            className="flex items-center justify-between bg-[#051a11] p-3 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Badge className="bg-[#1A4D2E] text-[#D4AF37] border-none">
                                Tap {keg.tapNumber || "?"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-[#1A4D2E] rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-[#D4AF37] rounded-full"
                                  style={{ width: `${(keg.remainingPercent * 100)}%` }}
                                />
                              </div>
                              <span className="text-white/60 text-sm w-12 text-right">
                                {(keg.remainingPercent * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {kegSummary && kegSummary.tapped.length > 0 && (
                      <p className="text-center text-sm text-white/40 mt-3">
                        = {kegSummary.tapped.reduce((sum, k) => sum + k.remainingPercent, 0).toFixed(2)} kegs on tap
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Cooler Stock Stepper */}
                <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Package className="w-5 h-5 text-[#D4AF37]" />
                      <span className="text-white font-medium">Cooler Stock</span>
                      <span className="text-white/40 text-sm ml-auto">Full kegs in cooler</span>
                    </div>
                    <div className="flex items-center justify-center gap-6">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCoolerStock(Math.max(0, coolerStock - 1))}
                        className="w-14 h-14 border-[#1A4D2E] text-white"
                        data-testid="button-cooler-minus"
                      >
                        <Minus className="w-6 h-6" />
                      </Button>
                      <span 
                        className="text-4xl font-bold text-[#D4AF37] w-20 text-center"
                        data-testid="text-cooler-count"
                      >
                        {coolerStock}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCoolerStock(coolerStock + 1)}
                        className="w-14 h-14 border-[#1A4D2E] text-white"
                        data-testid="button-cooler-plus"
                      >
                        <Plus className="w-6 h-6" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Fixed Bottom: Total + Save Button */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#051a11] border-t border-[#1A4D2E]">
              {/* Total Units Display */}
              <div className="px-4 py-3 border-b border-[#1A4D2E]/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60">Total On Hand</span>
                    {!currentProduct.isSoldByVolume && !isManualEstimate && (
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
                      {currentProduct.isSoldByVolume 
                        ? `(${kegSummary?.tapped.reduce((s, k) => s + k.remainingPercent, 0).toFixed(1) || 0} tapped + ${coolerStock} cooler)`
                        : `(${(partialPercent[0] / 100).toFixed(1)} open + ${backupCount} sealed)`
                      }
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Save Button */}
              <div className="p-4">
                <Button
                  onClick={handleSaveCount}
                  disabled={saveCountMutation.isPending || (currentProduct.isSoldByVolume && kegSummary === null)}
                  className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
                  data-testid="button-save-next"
                >
                  {saveCountMutation.isPending ? "Saving..." : (
                    currentProduct.isSoldByVolume && kegSummary === null ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Save & {quickScanMode ? "Scan Next" : "Continue"}
                        {quickScanMode && <Camera className="w-5 h-5 ml-2" />}
                      </>
                    )
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

        {/* VIEW COMPLETED MODE */}
        {mode === "view-completed" && viewSessionData && (
          <div className="space-y-4 pb-24">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">Completed Counts</h2>
              <Badge variant="outline" className="border-green-400 text-green-400">
                <Check className="w-3 h-3 mr-1" />
                Completed
              </Badge>
            </div>
            
            <Card className="bg-[#0a2419] border border-[#1A4D2E]">
              <CardContent className="p-4">
                <p className="text-sm text-white/60">
                  Completed: {viewSessionData.session.completedAt 
                    ? new Date(viewSessionData.session.completedAt).toLocaleString()
                    : "Unknown"
                  }
                </p>
                <p className="text-sm text-white/60 mt-1">
                  Items counted: {viewSessionData.counts.length}
                </p>
              </CardContent>
            </Card>
            
            {viewSessionData.counts.length === 0 ? (
              <Card className="bg-[#0a2419] border border-[#1A4D2E]">
                <CardContent className="p-6 text-center text-white/60">
                  No items were counted in this session
                </CardContent>
              </Card>
            ) : (
              viewSessionData.counts.map((count) => {
                const product = displayProducts.find(p => p.id === count.productId);
                if (!product) return null;
                
                const totalUnits = count.countedBottles + (count.countedPartialOz 
                  ? count.countedPartialOz / ((product.bottleSizeMl || 750) / 29.574) 
                  : 0);
                
                return (
                  <Card 
                    key={count.id}
                    className="bg-[#0a2419] border-2 border-[#1A4D2E]"
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
                            {count.countedBottles} bottles
                            {count.countedPartialOz && count.countedPartialOz > 0 
                              ? ` + ${count.countedPartialOz.toFixed(1)} oz partial` 
                              : ""}
                          </p>
                        </div>
                        <div className="text-right text-[#D4AF37] font-medium text-lg">
                          {totalUnits.toFixed(1)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E]">
              <Button
                onClick={() => setLocation(`/inventory?zone=${viewSessionData.session.zoneId}`)}
                className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
                data-testid="button-start-new-count"
              >
                Start New Count for This Zone
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
