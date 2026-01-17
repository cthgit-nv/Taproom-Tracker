import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InventorySession, Product } from "@shared/schema";

export interface OfflineCount {
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

export function useOfflineSync(activeSession: InventorySession | null, products: Product[]) {
  const { toast } = useToast();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlineCounts, setOfflineCounts] = useState<OfflineCount[]>([]);
  const [cachedProducts, setCachedProducts] = useState<Product[]>([]);

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

  // Load cached products and offline counts on mount
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

  // Cache products when they load
  useEffect(() => {
    if (products.length > 0) {
      localStorage.setItem("wellstocked_products", JSON.stringify(products));
      setCachedProducts(products);
    }
  }, [products]);

  const syncOfflineCounts = useCallback(async () => {
    if (offlineCounts.length === 0 || !activeSession) return;

    for (const count of offlineCounts) {
      try {
        const bottleSizeMl = count.bottleSizeMl || 750;
        const isKeg = count.isKeg || false;

        // Send partial value in milliliters
        const partialMl = !isKeg && count.partialPercent > 0
          ? (count.partialPercent / 100) * bottleSizeMl
          : null;

        await apiRequest("POST", "/api/inventory/counts", {
          sessionId: activeSession.id,
          productId: count.productId,
          countedBottles: count.countedBottles,
          countedPartialOz: partialMl,
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
  }, [offlineCounts, activeSession, toast]);

  const saveOfflineCount = (count: OfflineCount) => {
    const newOfflineCounts = [...offlineCounts, count];
    setOfflineCounts(newOfflineCounts);
    localStorage.setItem("wellstocked_offline_counts", JSON.stringify(newOfflineCounts));
  };

  const displayProducts = isOffline ? cachedProducts : products;

  return {
    isOffline,
    offlineCounts,
    displayProducts,
    saveOfflineCount,
    syncOfflineCounts,
  };
}
