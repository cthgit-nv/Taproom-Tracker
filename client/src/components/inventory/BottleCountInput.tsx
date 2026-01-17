import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Package, Plus, Minus, Wine } from "lucide-react";

interface BottleCountInputProps {
  partialPercent: number;
  backupCount: number;
  onPartialPercentChange: (value: number) => void;
  onBackupCountChange: (value: number) => void;
}

export function BottleCountInput({
  partialPercent,
  backupCount,
  onPartialPercentChange,
  onBackupCountChange,
}: BottleCountInputProps) {
  return (
    <>
      {/* Open/Partial Bottle Slider */}
      <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wine className="w-5 h-5 text-[#D4AF37]" />
              <span className="text-white font-medium">Open/Partial Bottle</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-white/60 mb-2">
                <span>Empty</span>
                <span className="font-medium text-orange-400">
                  {partialPercent}%
                </span>
                <span>Full</span>
              </div>
              <Slider
                value={[partialPercent]}
                onValueChange={(value) => onPartialPercentChange(value[0])}
                max={100}
                step={5}
                className="w-full"
                data-testid="slider-partial"
              />
              <p className="text-center text-sm text-white/40 mt-2">
                = {(partialPercent / 100).toFixed(2)} units
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
              onClick={() => onBackupCountChange(Math.max(0, backupCount - 1))}
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
              onClick={() => onBackupCountChange(backupCount + 1)}
              className="w-14 h-14 border-[#1A4D2E] text-white"
              data-testid="button-backup-plus"
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
