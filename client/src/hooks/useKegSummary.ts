import { useState, useEffect } from "react";

export interface KegSummary {
  tapped: Array<{
    kegId: number;
    tapNumber: number | null;
    remainingPercent: number;
  }>;
  onDeckCount: number;
  totalKegEquivalent: number;
}

export function useKegSummary(productId: number | null, isSoldByVolume: boolean) {
  const [kegSummary, setKegSummary] = useState<KegSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!productId || !isSoldByVolume) {
      setKegSummary(null);
      return;
    }

    const fetchKegSummary = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/kegs/product/${productId}/summary`, {
          credentials: "include",
        });
        const summary = await res.json();
        setKegSummary(summary);
      } catch (error) {
        console.error("Failed to fetch keg summary:", error);
        setKegSummary(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKegSummary();
  }, [productId, isSoldByVolume]);

  return { kegSummary, isLoading };
}
