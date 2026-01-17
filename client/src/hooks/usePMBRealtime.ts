import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { pmbService, type KegLevel } from "@/services/PourMyBeerService";
import type { Settings } from "@shared/schema";

interface KegSummary {
  tapped: Array<{
    kegId: number;
    tapNumber: number | null;
    remainingPercent: number;
  }>;
  onDeckCount: number;
  totalKegEquivalent: number;
}

export function usePMBRealtime(settings: Settings | undefined) {
  const { toast } = useToast();
  const [pmbConnected, setPmbConnected] = useState(false);
  const [pmbLevels, setPmbLevels] = useState<Map<number, KegLevel>>(new Map());

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
  }, [toast]);

  // Fetch PMB keg levels for specific taps
  const fetchPmbLevels = useCallback(async (tapNumbers: number[]) => {
    if (!pmbConnected || tapNumbers.length === 0) return;

    try {
      const levels = await pmbService.getKegLevels(tapNumbers);
      setPmbLevels(levels);
    } catch (error) {
      console.error("Failed to fetch PMB keg levels:", error);
    }
  }, [pmbConnected]);

  // Setup periodic polling for keg levels
  const usePMBPolling = (kegSummary: KegSummary | null) => {
    useEffect(() => {
      if (!pmbConnected || !kegSummary?.tapped?.length) return;

      const tapNumbers = kegSummary.tapped
        .filter((k) => k.tapNumber !== null)
        .map((k) => k.tapNumber as number);

      if (tapNumbers.length === 0) return;

      // Initial fetch
      fetchPmbLevels(tapNumbers);

      // Set up periodic refresh every 30 seconds
      const intervalId = setInterval(() => {
        fetchPmbLevels(tapNumbers);
      }, 30000);

      return () => clearInterval(intervalId);
    }, [kegSummary]);
  };

  return {
    pmbConnected,
    pmbLevels,
    fetchPmbLevels,
    usePMBPolling,
  };
}
