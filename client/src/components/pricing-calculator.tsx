import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Calculator, DollarSign } from "lucide-react";

const UNIT_SIZES = [
  { value: "half_bbl", label: "1/2 BBL (15.5 gal)", oz: 1984, isKeg: true },
  { value: "50l", label: "50L Keg (13.2 gal)", oz: 1690, isKeg: true },
  { value: "sixth_bbl", label: "1/6 BBL (5.16 gal)", oz: 661, isKeg: true },
  { value: "corny", label: "Corny Keg (5 gal)", oz: 640, isKeg: true },
  { value: "1L", label: "Bottle (1L)", oz: 33.8, isKeg: false },
  { value: "750ml", label: "Bottle (750ml)", oz: 25.4, isKeg: false },
  { value: "375ml", label: "Bottle (375ml)", oz: 12.7, isKeg: false },
  { value: "200ml", label: "Bottle (200ml)", oz: 6.8, isKeg: false },
] as const;

const POUR_SIZES = [
  { value: "16", label: "Pint (16 oz)", oz: 16 },
  { value: "12", label: "12 oz", oz: 12 },
  { value: "10", label: "10 oz", oz: 10 },
  { value: "5", label: "Wine (5 oz)", oz: 5 },
  { value: "1.5", label: "Shot (1.5 oz)", oz: 1.5 },
  { value: "1", label: "Per Ounce", oz: 1 },
] as const;

interface PricingCalculatorProps {
  isSoldByVolume?: boolean;
  beverageType?: string;
  bottleSizeMl?: number;
  onApplyPrice?: (pricePerServing: number, costPerOz: number, servingSize: number) => void;
  className?: string;
}

export function PricingCalculator({ 
  isSoldByVolume = true, 
  beverageType = "beer",
  bottleSizeMl,
  onApplyPrice,
  className = "",
}: PricingCalculatorProps) {
  const getDefaultUnit = () => {
    if (bottleSizeMl) {
      if (bottleSizeMl >= 900) return "1L";
      if (bottleSizeMl >= 500) return "750ml";
      if (bottleSizeMl >= 300) return "375ml";
      return "200ml";
    }
    return "half_bbl";
  };

  const getDefaultPourSize = () => {
    if (!isSoldByVolume) return "1.5";
    if (beverageType === "wine") return "5";
    return "16";
  };

  const [unitSize, setUnitSize] = useState<string>(getDefaultUnit);
  const [pourSize, setPourSize] = useState<string>(getDefaultPourSize);
  const [wholesaleCost, setWholesaleCost] = useState<string>("");
  const [pourCostPercent, setPourCostPercent] = useState(22);

  useEffect(() => {
    setUnitSize(getDefaultUnit());
    setPourSize(getDefaultPourSize());
  }, [bottleSizeMl, beverageType, isSoldByVolume]);

  const selectedUnit = UNIT_SIZES.find(u => u.value === unitSize);
  const selectedPour = POUR_SIZES.find(p => p.value === pourSize);
  const totalOz = selectedUnit?.oz || 1984;
  const servingOz = selectedPour?.oz || 16;
  const cost = parseFloat(wholesaleCost) || 0;

  const calculations = useMemo(() => {
    if (!cost || cost <= 0) {
      return null;
    }

    const costPerOz = cost / totalOz;
    const costPerServing = costPerOz * servingOz;
    const pricePerServing = costPerServing / (pourCostPercent / 100);
    const margin = 100 - pourCostPercent;
    const servingsPerUnit = Math.floor(totalOz / servingOz);

    return {
      costPerOz,
      costPerServing,
      pricePerServing,
      margin,
      isLowMargin: pourCostPercent > 30,
      servingsPerUnit,
      servingOz,
      totalRevenue: pricePerServing * servingsPerUnit,
      profit: (pricePerServing * servingsPerUnit) - cost,
    };
  }, [cost, totalOz, servingOz, pourCostPercent]);

  const handleApply = () => {
    if (calculations && onApplyPrice) {
      onApplyPrice(calculations.pricePerServing, calculations.costPerOz, servingOz);
    }
  };

  const showPourSize = isSoldByVolume && selectedUnit?.isKeg;

  return (
    <Card className={`bg-[#051a11] border-[#1A4D2E] ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-[#D4AF37] flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          Pricing Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-white/60 text-xs">Package Size</Label>
            <Select value={unitSize} onValueChange={setUnitSize}>
              <SelectTrigger 
                className="bg-[#0a2419] border-[#1A4D2E] text-white"
                data-testid="select-unit-size"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                {UNIT_SIZES.map(size => (
                  <SelectItem 
                    key={size.value} 
                    value={size.value} 
                    className="text-white"
                  >
                    {size.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showPourSize ? (
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">Pour Size</Label>
              <Select value={pourSize} onValueChange={setPourSize}>
                <SelectTrigger 
                  className="bg-[#0a2419] border-[#1A4D2E] text-white"
                  data-testid="select-pour-size"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                  {POUR_SIZES.map(size => (
                    <SelectItem 
                      key={size.value} 
                      value={size.value} 
                      className="text-white"
                    >
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">Serving</Label>
              <div className="h-9 flex items-center px-3 bg-[#0a2419] border border-[#1A4D2E] rounded-md text-white/60 text-sm">
                {!isSoldByVolume ? "1.5 oz shot" : `${totalOz.toFixed(1)} oz bottle`}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-white/60 text-xs">Wholesale Cost ($)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={wholesaleCost}
              onChange={(e) => setWholesaleCost(e.target.value)}
              placeholder="Enter cost..."
              className="bg-[#0a2419] border-[#1A4D2E] text-white pl-9"
              data-testid="input-wholesale-cost"
            />
          </div>
          {wholesaleCost === "" && (
            <p className="text-xs text-white/40">Enter wholesale cost to calculate pricing</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-white/60 text-xs">Target Pour Cost</Label>
            <span className="text-sm font-medium text-white">{pourCostPercent}%</span>
          </div>
          <Slider
            value={[pourCostPercent]}
            onValueChange={(v) => setPourCostPercent(v[0])}
            min={15}
            max={35}
            step={1}
            className="py-2"
            data-testid="slider-pour-cost"
          />
          <div className="flex justify-between text-xs text-white/40">
            <span>15% (high margin)</span>
            <span>35% (low margin)</span>
          </div>
        </div>

        {calculations && (
          <div className="space-y-3 pt-3 border-t border-[#1A4D2E]">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-white/40 text-xs">Cost per serving</span>
                <p className="text-white">${calculations.costPerServing.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-white/40 text-xs">Cost per oz</span>
                <p className="text-white">${calculations.costPerOz.toFixed(3)}</p>
              </div>
            </div>

            <div className="bg-[#0a2419] rounded-md p-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-white/60 text-xs">Suggested Price</span>
                  <p className="text-[#D4AF37] font-bold text-2xl">
                    ${calculations.pricePerServing.toFixed(2)}
                  </p>
                  <span className="text-white/40 text-xs">
                    per {showPourSize ? selectedPour?.label : (!isSoldByVolume ? "shot" : "bottle")}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-medium ${
                    calculations.isLowMargin ? "text-orange-400" : "text-green-400"
                  }`}>
                    {calculations.margin}% margin
                  </span>
                  {showPourSize && (
                    <p className="text-white/40 text-xs">{calculations.servingsPerUnit} servings</p>
                  )}
                </div>
              </div>
            </div>

            {showPourSize && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-white/40 text-xs">Total Revenue</span>
                  <p className="text-white">${calculations.totalRevenue.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-white/40 text-xs">Profit</span>
                  <p className="text-green-400">${calculations.profit.toFixed(2)}</p>
                </div>
              </div>
            )}

            {calculations.isLowMargin && (
              <div className="flex items-center gap-2 p-2 rounded bg-orange-500/10 border border-orange-500/30">
                <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span className="text-xs text-orange-400">Low Margin Warning: Pour cost exceeds 30%</span>
              </div>
            )}

            {onApplyPrice && (
              <Button
                onClick={handleApply}
                className="w-full bg-[#1A4D2E] text-white"
                data-testid="button-apply-price"
              >
                Apply ${calculations.pricePerServing.toFixed(2)} per {showPourSize ? `${servingOz}oz` : (!isSoldByVolume ? "shot" : "bottle")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
