import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { Product } from "@shared/schema";
import type { CountData } from "@/hooks/useInventorySession";
import type { OfflineCount } from "@/hooks/useOfflineSync";

interface InventoryReviewProps {
  counts: Map<number, CountData>;
  products: Product[];
  offlineCounts: OfflineCount[];
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function InventoryReview({
  counts,
  products,
  offlineCounts,
  onSubmit,
  isSubmitting,
}: InventoryReviewProps) {
  return (
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
        const product = products.find((p) => p.id === productId);
        if (!product) return null;

        const expected = product.currentCountBottles || 0;
        const variance = count.totalUnits - expected;
        const isLargeVariance = Math.abs(variance) > 2;

        return (
          <Card
            key={productId}
            className={`bg-[#0a2419] border-2 ${
              isLargeVariance ? "border-red-500" : "border-[#1A4D2E]"
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{product.name}</p>
                    <Badge
                      variant="outline"
                      className="text-xs border-orange-400 text-orange-400"
                    >
                      Manual
                    </Badge>
                  </div>
                  <p className="text-sm text-white/60">
                    Expected: {expected.toFixed(1)} | Counted:{" "}
                    {count.totalUnits.toFixed(1)}
                  </p>
                </div>
                <div
                  className={`text-right ${
                    isLargeVariance ? "text-red-400" : "text-white/60"
                  }`}
                >
                  {isLargeVariance && (
                    <AlertTriangle className="w-5 h-5 inline mr-1" />
                  )}
                  <span className="font-medium">
                    {variance > 0 ? "+" : ""}
                    {variance.toFixed(1)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#051a11] border-t border-[#1A4D2E]">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="w-full h-14 bg-[#D4AF37] text-[#051a11] text-lg font-semibold"
          data-testid="button-submit-session"
        >
          {isSubmitting ? "Submitting..." : "Finish Session"}
        </Button>
      </div>
    </div>
  );
}
