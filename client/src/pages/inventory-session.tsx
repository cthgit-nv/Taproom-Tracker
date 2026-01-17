import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Camera,
  List,
  Check,
  Wifi,
  WifiOff,
  Zap,
  Beer,
} from "lucide-react";
import type { Zone, Product, Settings } from "@shared/schema";
import { useInventorySession, type CountData } from "@/hooks/useInventorySession";
import { useOfflineSync, type OfflineCount } from "@/hooks/useOfflineSync";
import { usePMBRealtime } from "@/hooks/usePMBRealtime";
import { useKegSummary } from "@/hooks/useKegSummary";
import { KegCountInput } from "@/components/inventory/KegCountInput";
import { BottleCountInput } from "@/components/inventory/BottleCountInput";
import { InventoryScanner } from "@/components/inventory/InventoryScanner";
import { InventoryReview } from "@/components/inventory/InventoryReview";

type Mode = "setup" | "list" | "scan" | "input" | "review";

export default function InventorySessionPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Mode and UI state
  const [mode, setMode] = useState<Mode>("setup");
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [quickScanMode, setQuickScanMode] = useState(true);

  // Count input state
  const [partialPercent, setPartialPercent] = useState(0);
  const [backupCount, setBackupCount] = useState(0);
  const [coolerStock, setCoolerStock] = useState(0);

  // Queries
  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/zones"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  // Custom hooks
  const {
    activeSession,
    selectedZone,
    counts,
    setSelectedZone,
    startSessionMutation,
    saveCountMutation,
    finishSessionMutation,
    saveCount,
  } = useInventorySession(zones);

  const {
    isOffline,
    offlineCounts,
    displayProducts,
    saveOfflineCount,
    syncOfflineCounts,
  } = useOfflineSync(activeSession, products);

  const { pmbConnected, pmbLevels, usePMBPolling } = usePMBRealtime(settings);

  const { kegSummary, isLoading: kegLoading } = useKegSummary(
    currentProduct?.id || null,
    currentProduct?.isSoldByVolume || false
  );

  // Set up PMB polling for current product's kegs
  usePMBPolling(kegSummary);

  // Initialize cooler stock when keg summary loads
  useEffect(() => {
    if (kegSummary) {
      setCoolerStock(kegSummary.onDeckCount || 0);
    }
  }, [kegSummary]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Calculate total units - differs for bottles vs kegs
  const getTotalUnits = () => {
    if (!currentProduct) return 0;

    if (currentProduct.isSoldByVolume) {
      // Kegs: sum of tapped remaining + cooler stock
      if (kegSummary === null) return 0;

      const tappedTotal = kegSummary.tapped.reduce((sum, k) => {
        const pmbLevel = k.tapNumber ? pmbLevels.get(k.tapNumber) : null;
        return sum + (pmbLevel ? pmbLevel.fillLevelPercent / 100 : k.remainingPercent);
      }, 0);
      return tappedTotal + coolerStock;
    } else {
      // Bottles: partial open + backup sealed count
      return partialPercent / 100 + backupCount;
    }
  };

  const totalUnits = getTotalUnits();

  const handleStartSession = () => {
    if (selectedZone) {
      startSessionMutation.mutate(selectedZone, {
        onSuccess: () => {
          setMode(quickScanMode ? "scan" : "list");
        },
      });
    }
  };

  const handleSelectProduct = (product: Product) => {
    setCurrentProduct(product);
    setPartialPercent(0);
    setBackupCount(product.backupCount || 0);
    setCoolerStock(0);
    setMode("input");
  };

  const handleSaveCount = () => {
    if (!currentProduct || !activeSession) return;

    const isKeg = !!currentProduct.isSoldByVolume;

    // Prevent saving until keg summary is loaded for kegs
    if (isKeg && kegSummary === null) {
      toast({
        title: "Loading",
        description: "Please wait for keg data to load",
        variant: "destructive",
      });
      return;
    }

    // For bottles: partial is in ml (converted from percentage)
    const partialMl =
      !isKeg && partialPercent > 0
        ? (partialPercent / 100) * (currentProduct.bottleSizeMl || 750)
        : null;

    // For bottles: countedBottles = backupCount (sealed units)
    // For kegs: countedBottles = coolerStock (on_deck kegs)
    const countedUnits = isKeg ? coolerStock : backupCount;

    const countData: CountData = {
      productId: currentProduct.id,
      countedBottles: countedUnits,
      countedPartialOz: partialMl,
      totalUnits: totalUnits,
      isManualEstimate: true,
    };

    saveCount(countData);

    if (isOffline) {
      const offlineCount: OfflineCount = {
        productId: currentProduct.id,
        productName: currentProduct.name,
        countedBottles: countedUnits,
        partialPercent: partialPercent,
        totalUnits: totalUnits,
        isManualEstimate: true,
        timestamp: Date.now(),
        bottleSizeMl: currentProduct.bottleSizeMl || 750,
        isKeg: isKeg,
      };
      saveOfflineCount(offlineCount);

      toast({
        title: "Saved Offline",
        description: `${currentProduct.name}: ${totalUnits.toFixed(1)} units`,
      });
    } else {
      saveCountMutation.mutate({
        sessionId: activeSession.id,
        productId: currentProduct.id,
        countedBottles: countedUnits,
        countedPartialOz: partialMl,
        isManualEstimate: true,
        isKeg: isKeg,
      });
    }

    setCurrentProduct(null);
    setMode(quickScanMode ? "scan" : "list");
  };

  const handleSubmitSession = async () => {
    if (offlineCounts.length > 0 && !isOffline) {
      await syncOfflineCounts();
    }

    if (activeSession) {
      finishSessionMutation.mutate(activeSession.id, {
        onSuccess: () => {
          setLocation("/dashboard");
        },
      });
    }
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
            </h1>
            {activeSession && (mode === "list" || mode === "scan" || mode === "input") && (
              <div className="flex items-center gap-2">
                <Badge className="bg-[#1A4D2E] text-[#D4AF37] border-none text-sm px-3">
                  {zones.find((z) => z.id === activeSession.zoneId)?.name}
                </Badge>
              </div>
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
                    <Zap
                      className={`w-6 h-6 ${
                        quickScanMode ? "text-[#D4AF37]" : "text-white/40"
                      }`}
                    />
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
                    className={
                      quickScanMode
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

            <div>
              <h2 className="text-lg font-medium text-white mb-4">Select Zone</h2>
              <div className="grid grid-cols-2 gap-3">
                {zones.map((zone) => (
                  <Card
                    key={zone.id}
                    onClick={() => setSelectedZone(zone.id)}
                    className={`
                      bg-[#0a2419] border-2 cursor-pointer overflow-visible
                      ${
                        selectedZone === zone.id
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
              {startSessionMutation.isPending
                ? "Starting..."
                : quickScanMode
                ? "Start Quick Scan"
                : "Start Count"}
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
                          <Badge variant="outline" className="border-orange-400 text-orange-400">
                            {countData.totalUnits.toFixed(1)}
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
                onClick={() => setMode("review")}
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
          <InventoryScanner
            products={displayProducts}
            isOffline={isOffline}
            onSelectProduct={handleSelectProduct}
            onFinishSession={() => setMode("review")}
            countsSize={counts.size}
          />
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
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        currentProduct.isSoldByVolume
                          ? "border-blue-400 text-blue-400"
                          : "border-green-400 text-green-400"
                      }`}
                    >
                      {currentProduct.isSoldByVolume ? "Keg" : "Bottle"}
                    </Badge>
                  </div>
                  <p className="text-sm text-white/60">
                    {currentProduct.isSoldByVolume
                      ? "Draft Beer"
                      : `${currentProduct.bottleSizeMl}ml`}
                    {currentProduct.style ? ` - ${currentProduct.style}` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bottle or Keg Input */}
            {currentProduct.isSoldByVolume ? (
              <KegCountInput
                kegSummary={kegSummary}
                pmbConnected={pmbConnected}
                pmbLevels={pmbLevels}
                coolerStock={coolerStock}
                onCoolerStockChange={setCoolerStock}
              />
            ) : (
              <BottleCountInput
                partialPercent={partialPercent}
                backupCount={backupCount}
                onPartialPercentChange={setPartialPercent}
                onBackupCountChange={setBackupCount}
              />
            )}

            {/* Fixed Bottom: Total + Save Button */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#051a11] border-t border-[#1A4D2E]">
              {/* Total Units Display */}
              <div className="px-4 py-3 border-b border-[#1A4D2E]/50">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Total On Hand</span>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-3xl font-bold text-[#D4AF37]"
                      data-testid="text-total-units"
                    >
                      {totalUnits.toFixed(1)}
                    </span>
                    <span className="text-white/40 text-sm">
                      {currentProduct.isSoldByVolume
                        ? `(${
                            kegSummary?.tapped.reduce((s, k) => {
                              const pmbLevel = k.tapNumber
                                ? pmbLevels.get(k.tapNumber)
                                : null;
                              return (
                                s +
                                (pmbLevel
                                  ? pmbLevel.fillLevelPercent / 100
                                  : k.remainingPercent)
                              );
                            }, 0).toFixed(1) || 0
                          } tapped + ${coolerStock} cooler)`
                        : `(${(partialPercent / 100).toFixed(1)} open + ${backupCount} sealed)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="p-4">
                <Button
                  onClick={handleSaveCount}
                  disabled={
                    saveCountMutation.isPending ||
                    (!!currentProduct.isSoldByVolume && kegSummary === null)
                  }
                  className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
                  data-testid="button-save-next"
                >
                  {saveCountMutation.isPending
                    ? "Saving..."
                    : `Save & ${quickScanMode ? "Scan Next" : "Continue"}`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* REVIEW MODE */}
        {mode === "review" && (
          <InventoryReview
            counts={counts}
            products={displayProducts}
            offlineCounts={offlineCounts}
            onSubmit={handleSubmitSession}
            isSubmitting={finishSessionMutation.isPending}
          />
        )}
      </main>
    </div>
  );
}
