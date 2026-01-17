import { useState, useEffect, useCallback, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
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
  Settings as SettingsIcon,
  Zap,
  Beer,
  Package,
  Loader2,
  Gauge
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PricingCalculator } from "@/components/pricing-calculator";
import type { Zone, Product, InventorySession, Settings } from "@shared/schema";
import { pmbService, type KegLevel } from "@/services/PourMyBeerService";

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
  
  // PMB real-time keg levels
  const [pmbLevels, setPmbLevels] = useState<Map<number, KegLevel>>(new Map());
  const [pmbConnected, setPmbConnected] = useState(false);
  
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
      // Use PMB levels if available, otherwise fall back to DB values
      const tappedTotal = kegSummary.tapped.reduce((sum, k) => {
        const pmbLevel = k.tapNumber ? pmbLevels.get(k.tapNumber) : null;
        return sum + (pmbLevel ? pmbLevel.fillLevelPercent / 100 : k.remainingPercent);
      }, 0);
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

  // Parse URL params for zone or view mode - re-run when URL changes
  useEffect(() => {
    const parseUrlParams = () => {
      const params = new URLSearchParams(window.location.search);
      const zoneParam = params.get("zone");
      const viewParam = params.get("view");
      
      if (viewParam) {
        const sessionId = parseInt(viewParam);
        if (!isNaN(sessionId)) {
          setViewSessionId(sessionId);
          setMode("view-completed");
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
    };
    
    parseUrlParams();
    
    // Listen for popstate events (back/forward navigation)
    const handlePopState = () => parseUrlParams();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    enabled: !isOffline,
  });

  // Configure PMB service when settings load
  useEffect(() => {
    if (settings) {
      pmbService.setConfig(settings);
      setPmbConnected(pmbService.isConfigured());
    }
  }, [settings]);

  // Register kick detection callback
  useEffect(() => {
    pmbService.onKickDetected((tapNumber, productName) => {
      toast({
        title: "Keg Kicked!",
        description: `Tap ${tapNumber}${productName ? ` (${productName})` : ""} is empty`,
        variant: "destructive",
        duration: 10000,
      });
    });
  }, []);

  // Fetch PMB keg levels for current product
  const fetchPmbLevels = useCallback(async (tapNumbers: number[]) => {
    if (!pmbConnected || tapNumbers.length === 0) return;
    
    try {
      const levels = await pmbService.getKegLevels(tapNumbers);
      setPmbLevels(levels);
    } catch (error) {
      console.error("Failed to fetch PMB keg levels:", error);
    }
  }, [pmbConnected]);

  // Periodic refresh of PMB levels (every 30 seconds)
  useEffect(() => {
    if (!pmbConnected || !kegSummary?.tapped?.length) return;

    const tapNumbers = kegSummary.tapped
      .filter((k) => k.tapNumber !== null)
      .map((k) => k.tapNumber as number);

    if (tapNumbers.length === 0) return;

    // Initial fetch on login/mount
    fetchPmbLevels(tapNumbers);

    // Set up periodic refresh
    const intervalId = setInterval(() => {
      fetchPmbLevels(tapNumbers);
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [pmbConnected, kegSummary, fetchPmbLevels]);

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
    
    // For kegs, fetch the keg summary and PMB levels
    if (product.isSoldByVolume) {
      setKegSummary(null);
      setPmbLevels(new Map());
      try {
        const res = await fetch(`/api/kegs/product/${product.id}/summary`, { credentials: "include" });
        const summary = await res.json();
        setKegSummary(summary);
        setCoolerStock(summary.onDeckCount || 0);
        
        // Fetch real-time levels from PMB for tapped kegs
        if (pmbConnected && summary.tapped?.length > 0) {
          const tapNumbers = summary.tapped
            .filter((k: { tapNumber: number | null }) => k.tapNumber !== null)
            .map((k: { tapNumber: number }) => k.tapNumber);
          if (tapNumbers.length > 0) {
            fetchPmbLevels(tapNumbers);
          }
        }
      } catch (error) {
        console.error("Failed to fetch keg summary:", error);
      }
    } else {
      setKegSummary(null);
      setCoolerStock(0);
      setPmbLevels(new Map());
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
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-2 md:py-3 safe-area-pt">
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

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E] safe-area-pb">
              <Button
                onClick={handleFinishSession}
                className="w-full h-12 md:h-14 bg-[#D4AF37] text-[#051a11] text-base md:text-lg font-semibold haptic-press"
                data-testid="button-finish-session"
              >
                Finish Session ({counts.size} items counted)
              </Button>
            </div>
          </div>
        )}

        {/* SCAN MODE */}
        {mode === "scan" && (
          <ScanModeContent
            displayProducts={displayProducts}
            handleSelectProduct={handleSelectProduct}
            handleFinishSession={handleFinishSession}
            countsSize={counts.size}
            isOffline={isOffline}
            scaleConnected={scaleConnected}
            setMode={setMode}
          />
        )}

        {/* INPUT MODE */}
        {mode === "input" && currentProduct && (
          <div className="space-y-3 md:space-y-4 pb-32 md:pb-36">
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
                    <SettingsIcon className="w-5 h-5" />
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
                {/* Tapped Kegs Display (Read-Only from PMB) */}
                <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Gauge className="w-5 h-5 text-[#D4AF37]" />
                      <span className="text-white font-medium">Active On Tap</span>
                      <Badge variant="outline" className={`text-xs ml-auto ${pmbConnected ? "border-green-400 text-green-400" : "border-white/40 text-white/40"}`}>
                        {pmbConnected ? "PMB Live" : "Simulation"}
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
                        {kegSummary.tapped.map((keg) => {
                          const pmbLevel = keg.tapNumber ? pmbLevels.get(keg.tapNumber) : null;
                          const fillPercent = pmbLevel ? pmbLevel.fillLevelPercent : keg.remainingPercent * 100;
                          const remainingGallons = pmbLevel 
                            ? (pmbLevel.remainingOz / 128).toFixed(1) 
                            : null;
                          
                          return (
                            <div 
                              key={keg.kegId}
                              className="flex items-center justify-between bg-[#051a11] p-3 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <Badge className="bg-[#1A4D2E] text-[#D4AF37] border-none">
                                  Tap {keg.tapNumber || "?"}
                                </Badge>
                                {remainingGallons && (
                                  <span className="text-white/80 text-sm font-medium">
                                    {remainingGallons} gal
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-[#1A4D2E] rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${fillPercent < 10 ? "bg-red-500" : fillPercent < 25 ? "bg-orange-400" : "bg-[#D4AF37]"}`}
                                    style={{ width: `${fillPercent}%` }}
                                  />
                                </div>
                                <span className="text-white/60 text-sm w-12 text-right">
                                  {fillPercent.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {kegSummary && kegSummary.tapped.length > 0 && (
                      <p className="text-center text-sm text-white/40 mt-3">
                        = {kegSummary.tapped.reduce((sum, k) => {
                          const pmbLevel = k.tapNumber ? pmbLevels.get(k.tapNumber) : null;
                          return sum + (pmbLevel ? pmbLevel.fillLevelPercent / 100 : k.remainingPercent);
                        }, 0).toFixed(2)} kegs on tap
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
            <div className="fixed bottom-0 left-0 right-0 bg-[#051a11] border-t border-[#1A4D2E] safe-area-pb">
              {/* Total Units Display */}
              <div className="px-4 py-2 md:py-3 border-b border-[#1A4D2E]/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-sm md:text-base">Total On Hand</span>
                    {!currentProduct.isSoldByVolume && !isManualEstimate && (
                      <Badge variant="outline" className="border-blue-400 text-blue-400 text-xs">
                        Scale
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl md:text-3xl font-bold text-[#D4AF37]" data-testid="text-total-units">
                      {totalUnits.toFixed(1)}
                    </span>
                    <span className="text-white/40 text-xs md:text-sm hidden sm:inline">
                      {currentProduct.isSoldByVolume
                        ? `(${kegSummary?.tapped.reduce((s, k) => {
                            const pmbLevel = k.tapNumber ? pmbLevels.get(k.tapNumber) : null;
                            return s + (pmbLevel ? pmbLevel.fillLevelPercent / 100 : k.remainingPercent);
                          }, 0).toFixed(1) || 0} tapped + ${coolerStock} cooler)`
                        : `(${(partialPercent[0] / 100).toFixed(1)} open + ${backupCount} sealed)`
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="p-3 md:p-4">
                <Button
                  onClick={handleSaveCount}
                  disabled={saveCountMutation.isPending || (!!currentProduct.isSoldByVolume && kegSummary === null)}
                  className="w-full h-12 md:h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-base md:text-lg font-semibold haptic-press"
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
                        {quickScanMode && <Camera className="w-4 h-4 md:w-5 md:h-5 ml-2" />}
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

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E] safe-area-pb">
              <Button
                onClick={handleSubmitSession}
                disabled={finishSessionMutation.isPending}
                className="w-full h-12 md:h-14 bg-[#D4AF37] text-[#051a11] text-base md:text-lg font-semibold haptic-press"
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

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E] safe-area-pb">
              <Button
                onClick={() => {
                  const zoneId = viewSessionData.session.zoneId;
                  setViewSessionId(null);
                  setViewSessionData(null);
                  setMode("setup");
                  setSelectedZone(zoneId);
                  setCounts(new Map());
                  setActiveSession(null);
                  setAutoStartZone(zoneId);
                }}
                className="w-full h-12 md:h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-base md:text-lg font-semibold haptic-press"
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
        <DialogContent className="bg-[#0a2419] border-[#1A4D2E] text-white mobile-dialog">
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

interface ScanModeProps {
  displayProducts: Product[];
  handleSelectProduct: (product: Product) => void;
  handleFinishSession: () => void;
  countsSize: number;
  isOffline: boolean;
  scaleConnected: boolean;
  setMode: (mode: Mode) => void;
}

function ScanModeContent({
  displayProducts,
  handleSelectProduct,
  handleFinishSession,
  countsSize,
  isOffline,
  scaleConnected,
  setMode,
}: ScanModeProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [upcLookupResult, setUpcLookupResult] = useState<{
    upc: string;
    title: string;
    brand?: string;
    size?: string;
  } | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductUpc, setNewProductUpc] = useState("");
  const [newProductSizeMl, setNewProductSizeMl] = useState("750");
  const [newProductBeverageType, setNewProductBeverageType] = useState("beer");
  
  const [useCameraScanner, setUseCameraScanner] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRunningRef = useRef(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scannerContainerId = "qr-scanner-container";
  
  const handleScannedCode = useCallback(async (code: string) => {
    if (code === lastScannedCodeRef.current) return;
    lastScannedCodeRef.current = code;
    
    const normalizedCode = code.replace(/[-\s]/g, "");
    const existingProduct = displayProducts.find((p) => p.upc && p.upc.replace(/[-\s]/g, "") === normalizedCode);
    
    if (existingProduct) {
      toast({ title: "Product found", description: existingProduct.name });
      handleSelectProduct(existingProduct);
    } else {
      setSearchQuery(normalizedCode);
      try {
        const response = await fetch(`/api/barcodespider/lookup/${normalizedCode}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setUpcLookupResult(data);
            setNewProductName(data.title || "");
            setNewProductUpc(data.upc || normalizedCode);
            if (data.size) {
              const mlMatch = data.size.match(/(\d+)\s*ml/i);
              const ozMatch = data.size.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
              const lMatch = data.size.match(/(\d+(?:\.\d+)?)\s*L/i);
              if (mlMatch) setNewProductSizeMl(mlMatch[1]);
              else if (ozMatch) setNewProductSizeMl(String(Math.round(parseFloat(ozMatch[1]) * 29.574)));
              else if (lMatch) setNewProductSizeMl(String(Math.round(parseFloat(lMatch[1]) * 1000)));
            }
            setShowAddProduct(true);
          } else {
            setNewProductUpc(normalizedCode);
            setNewProductName("");
            setShowAddProduct(true);
            toast({ title: "New product", description: "UPC not in database - enter details" });
          }
        } else {
          setNewProductUpc(normalizedCode);
          setShowAddProduct(true);
        }
      } catch {
        setNewProductUpc(normalizedCode);
        setShowAddProduct(true);
      }
    }
    
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    scanTimeoutRef.current = setTimeout(() => {
      lastScannedCodeRef.current = null;
    }, 3000);
  }, [displayProducts, handleSelectProduct, toast]);
  
  // Calculate responsive qrbox dimensions based on screen size
  const getResponsiveQrBox = () => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Use smaller dimensions on mobile for compact camera view
    if (screenWidth < 400) {
      // iPhone SE and small phones
      return { width: Math.min(200, screenWidth * 0.6), height: 100 };
    } else if (screenWidth < 768) {
      // Standard phones
      return { width: Math.min(220, screenWidth * 0.55), height: 120 };
    } else {
      // Tablets (iPad)
      return { width: 280, height: 160 };
    }
  };

  useEffect(() => {
    const stopScanner = async () => {
      if (scannerRef.current && scannerRunningRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
        }
        scannerRunningRef.current = false;
      }
      scannerRef.current = null;
      setScannerReady(false);
    };

    if (!useCameraScanner) {
      stopScanner();
      return;
    }

    const startScanner = async () => {
      try {
        const container = document.getElementById(scannerContainerId);
        if (!container) {
          setTimeout(startScanner, 100);
          return;
        }

        await stopScanner();

        const scanner = new Html5Qrcode(scannerContainerId);
        scannerRef.current = scanner;

        // Use responsive qrbox and wider aspect ratio for compact view
        const qrbox = getResponsiveQrBox();

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox,
            aspectRatio: 1.777, // 16:9 for more compact view
          },
          (decodedText) => {
            handleScannedCode(decodedText);
          },
          () => {}
        );

        scannerRunningRef.current = true;
        setScannerReady(true);
        setCameraError(null);
      } catch (err) {
        console.error("Camera error:", err);
        scannerRunningRef.current = false;
        const message = err instanceof Error ? err.message : "Camera access denied";
        setCameraError(message.includes("Permission") ? "Camera permission denied. Please allow camera access." : "Could not start camera. Try manual entry.");
        setScannerReady(false);
      }
    };

    startScanner();

    return () => {
      stopScanner();
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [useCameraScanner, handleScannedCode]);
  
  const cleanUpc = (query: string) => query.replace(/[-\s]/g, "");
  const isUpc = (query: string) => /^\d{8,14}$/.test(cleanUpc(query));
  
  const filteredProducts = displayProducts.filter((p) => {
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
      const existingProduct = displayProducts.find((p) => p.upc && cleanUpc(p.upc) === normalizedUpc);
      if (existingProduct) {
        handleSelectProduct(existingProduct);
        setSearchQuery("");
        return;
      }
      
      setIsSearching(true);
      try {
        const response = await fetch(`/api/barcodespider/lookup/${normalizedUpc}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setUpcLookupResult(data);
            setNewProductName(data.title || "");
            setNewProductUpc(data.upc || cleanQuery);
            if (data.size) {
              const mlMatch = data.size.match(/(\d+)\s*ml/i);
              const ozMatch = data.size.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
              const lMatch = data.size.match(/(\d+(?:\.\d+)?)\s*L/i);
              if (mlMatch) setNewProductSizeMl(mlMatch[1]);
              else if (ozMatch) setNewProductSizeMl(String(Math.round(parseFloat(ozMatch[1]) * 29.574)));
              else if (lMatch) setNewProductSizeMl(String(Math.round(parseFloat(lMatch[1]) * 1000)));
            }
            setShowAddProduct(true);
          } else {
            setNewProductUpc(cleanQuery);
            setNewProductName("");
            setShowAddProduct(true);
            toast({ title: "UPC not found", description: "Enter product details manually" });
          }
        } else {
          setNewProductUpc(cleanQuery);
          setNewProductName("");
          setShowAddProduct(true);
        }
      } catch (error) {
        setNewProductUpc(cleanQuery);
        setShowAddProduct(true);
      } finally {
        setIsSearching(false);
      }
    } else {
      if (filteredProducts.length === 1) {
        handleSelectProduct(filteredProducts[0]);
        setSearchQuery("");
      } else if (filteredProducts.length === 0) {
        setNewProductName(cleanQuery);
        setNewProductUpc("");
        setShowAddProduct(true);
      }
    }
  };
  
  const createProductMutation = useMutation({
    mutationFn: async (data: { name: string; upc?: string; bottleSizeMl: number; beverageType: string }) => {
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
      handleSelectProduct(newProduct);
      setShowAddProduct(false);
      setSearchQuery("");
      setNewProductName("");
      setNewProductUpc("");
      setUpcLookupResult(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create product", variant: "destructive" });
    },
  });
  
  const handleCreateProduct = () => {
    if (!newProductName.trim()) {
      toast({ title: "Error", description: "Product name is required", variant: "destructive" });
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

      <div className="flex gap-2 mb-2">
        <Button
          variant={useCameraScanner ? "default" : "outline"}
          onClick={() => setUseCameraScanner(true)}
          className={useCameraScanner ? "flex-1 bg-[#D4AF37] text-[#051a11]" : "flex-1 border-[#1A4D2E] text-white/60"}
          data-testid="button-use-camera"
        >
          <Camera className="w-4 h-4 mr-2" />
          Camera
        </Button>
        <Button
          variant={!useCameraScanner ? "default" : "outline"}
          onClick={() => setUseCameraScanner(false)}
          className={!useCameraScanner ? "flex-1 bg-[#D4AF37] text-[#051a11]" : "flex-1 border-[#1A4D2E] text-white/60"}
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
              <div className="camera-scanner-compact bg-black flex flex-col items-center justify-center p-4">
                <AlertTriangle className="w-10 h-10 text-orange-400 mb-2" />
                <p className="text-orange-300 text-center text-sm mb-3">{cameraError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUseCameraScanner(false)}
                  className="border-[#D4AF37] text-[#D4AF37]"
                >
                  Use Manual Entry
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div id={scannerContainerId} className="w-full camera-scanner-compact" />
                {!scannerReady && (
                  <div className="absolute inset-0 bg-black flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin mx-auto mb-1" />
                      <p className="text-white/60 text-xs">Starting camera...</p>
                    </div>
                  </div>
                )}
                {scannerReady && (
                  <div className="absolute bottom-1 left-0 right-0 text-center">
                    <Badge className="bg-green-500/80 text-white text-xs px-2 py-0.5">
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
            <p className="text-xs text-white/40">Enter UPC barcode or start typing product name</p>
          </CardContent>
        </Card>
      )}

      {scaleConnected && (
        <p className="text-center text-blue-400 text-sm flex items-center justify-center gap-2">
          <BluetoothConnected className="w-4 h-4" />
          Scale will auto-weigh on scan
        </p>
      )}

      {searchQuery && filteredProducts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-white/60">Matching products:</p>
          {filteredProducts.slice(0, 8).map((product) => (
            <Card
              key={product.id}
              className="bg-[#0a2419] border-[#1A4D2E] hover-elevate cursor-pointer"
              onClick={() => {
                handleSelectProduct(product);
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
                    {product.upc || "No UPC"} {product.bottleSizeMl ? `- ${product.bottleSizeMl}ml` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs border-[#1A4D2E] text-white/60 flex-shrink-0">
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
                {isUpc(searchQuery) ? "Look up UPC and create product" : `Create "${searchQuery}"`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent className="bg-[#0a2419] border-[#1A4D2E] text-white max-w-md mobile-dialog overflow-y-auto ios-scroll">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Add New Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
            <div className="space-y-1.5">
              <Label className="text-white text-sm">Product Name *</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g., Sierra Nevada Pale Ale"
                className="bg-[#051a11] border-[#1A4D2E] text-white h-10"
                data-testid="input-new-product-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white text-sm">UPC Code</Label>
              <Input
                value={newProductUpc}
                onChange={(e) => setNewProductUpc(e.target.value)}
                placeholder="12-digit barcode"
                className="bg-[#051a11] border-[#1A4D2E] text-white h-10"
                data-testid="input-new-product-upc"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-white text-sm">Size (ml)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={newProductSizeMl}
                  onChange={(e) => setNewProductSizeMl(e.target.value)}
                  placeholder="750"
                  className="bg-[#051a11] border-[#1A4D2E] text-white h-10"
                  data-testid="input-new-product-size"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white text-sm">Type</Label>
                <select
                  value={newProductBeverageType}
                  onChange={(e) => setNewProductBeverageType(e.target.value)}
                  className="w-full h-10 rounded-md bg-[#051a11] border border-[#1A4D2E] text-white px-3"
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

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E] safe-area-pb">
        <Button
          onClick={handleFinishSession}
          className="w-full h-12 md:h-14 bg-[#D4AF37] text-[#051a11] text-base md:text-lg font-semibold haptic-press"
          data-testid="button-finish-session-scan"
        >
          Finish Session ({countsSize} items counted)
        </Button>
      </div>
    </div>
  );
}
