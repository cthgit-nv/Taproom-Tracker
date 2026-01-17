import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, Package, Plus, Minus, Loader2 } from "lucide-react";
import type { KegLevel } from "@/services/PourMyBeerService";
import type { KegSummary } from "@/hooks/useKegSummary";

interface KegCountInputProps {
  kegSummary: KegSummary | null;
  pmbConnected: boolean;
  pmbLevels: Map<number, KegLevel>;
  coolerStock: number;
  onCoolerStockChange: (value: number) => void;
}

export function KegCountInput({
  kegSummary,
  pmbConnected,
  pmbLevels,
  coolerStock,
  onCoolerStockChange,
}: KegCountInputProps) {
  return (
    <>
      {/* Tapped Kegs Display (Read-Only from PMB) */}
      <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="w-5 h-5 text-[#D4AF37]" />
            <span className="text-white font-medium">Active On Tap</span>
            <Badge
              variant="outline"
              className={`text-xs ml-auto ${
                pmbConnected
                  ? "border-green-400 text-green-400"
                  : "border-white/40 text-white/40"
              }`}
            >
              {pmbConnected ? "PMB Live" : "Simulation"}
            </Badge>
          </div>

          {kegSummary === null ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin" />
            </div>
          ) : kegSummary.tapped.length === 0 ? (
            <p className="text-white/40 text-center py-4">
              No kegs currently tapped
            </p>
          ) : (
            <div className="space-y-2">
              {kegSummary.tapped.map((keg) => {
                const pmbLevel = keg.tapNumber
                  ? pmbLevels.get(keg.tapNumber)
                  : null;
                const fillPercent = pmbLevel
                  ? pmbLevel.fillLevelPercent
                  : keg.remainingPercent * 100;
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
                          className={`h-full rounded-full ${
                            fillPercent < 10
                              ? "bg-red-500"
                              : fillPercent < 25
                              ? "bg-orange-400"
                              : "bg-[#D4AF37]"
                          }`}
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
              ={" "}
              {kegSummary.tapped
                .reduce((sum, k) => {
                  const pmbLevel = k.tapNumber ? pmbLevels.get(k.tapNumber) : null;
                  return (
                    sum +
                    (pmbLevel ? pmbLevel.fillLevelPercent / 100 : k.remainingPercent)
                  );
                }, 0)
                .toFixed(2)}{" "}
              kegs on tap
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
            <span className="text-white/40 text-sm ml-auto">
              Full kegs in cooler
            </span>
          </div>
          <div className="flex items-center justify-center gap-6">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onCoolerStockChange(Math.max(0, coolerStock - 1))}
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
              onClick={() => onCoolerStockChange(coolerStock + 1)}
              className="w-14 h-14 border-[#1A4D2E] text-white"
              data-testid="button-cooler-plus"
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
