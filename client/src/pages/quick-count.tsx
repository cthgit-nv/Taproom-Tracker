import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Plus,
  Minus,
  Check,
  ChevronRight,
  ChevronLeft,
  Beer,
  Package,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Zone, Product, InventorySession } from "@shared/schema";

type Step = "zone" | "counting" | "done";

interface CountEntry {
  productId: number;
  count: number;
  counted: boolean;
}

export default function QuickCountPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("zone");
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [counts, setCounts] = useState<Map<number, CountEntry>>(new Map());
  const [session, setSession] = useState<InventorySession | null>(null);

  // Fetch zones
  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/zones"],
  });

  // Fetch products for selected zone (all products for now, can filter by zone later)
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: step === "counting",
  });

  // Filter to bottle products only (simpler for quick count)
  // Kegs require PMB integration which adds complexity
  const products = allProducts.filter((p) => !p.isSoldByVolume);

  const currentProduct = products[currentIndex] || null;
  const progress = products.length > 0
    ? Math.round((Array.from(counts.values()).filter(c => c.counted).length / products.length) * 100)
    : 0;

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Initialize counts when products load
  useEffect(() => {
    if (products.length > 0 && counts.size === 0) {
      const initialCounts = new Map<number, CountEntry>();
      products.forEach((p) => {
        initialCounts.set(p.id, {
          productId: p.id,
          count: p.currentCountBottles || 0,
          counted: false,
        });
      });
      setCounts(initialCounts);
    }
  }, [products, counts.size]);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (zoneId: number) => {
      const res = await apiRequest("POST", "/api/inventory/sessions", {
        zoneId,
        isSimulation: false,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSession(data);
      setStep("counting");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not start inventory session",
        variant: "destructive",
      });
    },
  });

  // Save count mutation
  const saveCountMutation = useMutation({
    mutationFn: async (data: { sessionId: number; productId: number; countedBottles: number }) => {
      const res = await apiRequest("POST", "/api/inventory/counts", data);
      return res.json();
    },
  });

  // Complete session mutation
  const completeSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await apiRequest("PATCH", `/api/inventory/sessions/${sessionId}`, {
        status: "completed",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sessions/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setStep("done");
    },
  });

  const handleZoneSelect = (zone: Zone) => {
    setSelectedZone(zone);
    createSessionMutation.mutate(zone.id);
  };

  const handleIncrement = () => {
    if (!currentProduct) return;
    const entry = counts.get(currentProduct.id);
    if (entry) {
      setCounts(new Map(counts.set(currentProduct.id, {
        ...entry,
        count: entry.count + 1,
      })));
    }
  };

  const handleDecrement = () => {
    if (!currentProduct) return;
    const entry = counts.get(currentProduct.id);
    if (entry && entry.count > 0) {
      setCounts(new Map(counts.set(currentProduct.id, {
        ...entry,
        count: entry.count - 1,
      })));
    }
  };

  const handleConfirmAndNext = async () => {
    if (!currentProduct || !session) return;

    const entry = counts.get(currentProduct.id);
    if (!entry) return;

    // Mark as counted
    setCounts(new Map(counts.set(currentProduct.id, {
      ...entry,
      counted: true,
    })));

    // Save to server
    await saveCountMutation.mutateAsync({
      sessionId: session.id,
      productId: currentProduct.id,
      countedBottles: entry.count,
    });

    // Move to next or finish
    if (currentIndex < products.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All done - complete session
      completeSessionMutation.mutate(session.id);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSkip = () => {
    if (currentIndex < products.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleStartOver = () => {
    setStep("zone");
    setSelectedZone(null);
    setCurrentIndex(0);
    setCounts(new Map());
    setSession(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#051a11]">
        <div className="text-[#D4AF37] animate-pulse text-xl">Loading...</div>
      </div>
    );
  }

  // STEP 1: Zone Selection
  if (step === "zone") {
    return (
      <div className="min-h-screen bg-[#051a11]">
        <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/inventory-dashboard")}
              className="text-white/60 h-12 w-12"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Quick Count</h1>
              <p className="text-white/60">Select a zone to count</p>
            </div>
          </div>
        </header>

        <main className="p-4 space-y-4">
          {zones.map((zone) => (
            <Card
              key={zone.id}
              onClick={() => handleZoneSelect(zone)}
              className="bg-[#0a2419] border-2 border-[#1A4D2E] hover:border-[#D4AF37] cursor-pointer transition-all active:scale-[0.98]"
            >
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">{zone.name}</h2>
                  {zone.description && (
                    <p className="text-white/50 mt-1">{zone.description}</p>
                  )}
                </div>
                <ChevronRight className="w-8 h-8 text-[#D4AF37]" />
              </CardContent>
            </Card>
          ))}

          {zones.length === 0 && (
            <div className="text-center py-12">
              <p className="text-white/60 text-lg">No zones configured yet.</p>
              <p className="text-white/40 mt-2">Ask a manager to set up zones.</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // STEP 2: Counting Products
  if (step === "counting" && currentProduct) {
    const entry = counts.get(currentProduct.id);
    const count = entry?.count || 0;
    const isLast = currentIndex === products.length - 1;

    return (
      <div className="min-h-screen bg-[#051a11] flex flex-col">
        {/* Header with progress */}
        <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setStep("zone")}
              className="text-white/60 h-10 w-10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="text-[#D4AF37] font-medium">{selectedZone?.name}</p>
              <p className="text-white/40 text-sm">
                {currentIndex + 1} of {products.length}
              </p>
            </div>
            <div className="w-10" /> {/* Spacer for alignment */}
          </div>
          <Progress value={progress} className="h-2 bg-[#1A4D2E]" />
        </header>

        {/* Product Display */}
        <main className="flex-1 flex flex-col p-6">
          {/* Product Name - Big and Clear */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#1A4D2E] mb-4">
              {currentProduct.isSoldByVolume ? (
                <Beer className="w-8 h-8 text-[#D4AF37]" />
              ) : (
                <Package className="w-8 h-8 text-[#D4AF37]" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-white leading-tight">
              {currentProduct.name}
            </h2>
            {currentProduct.brand && (
              <p className="text-white/50 mt-1">{currentProduct.brand}</p>
            )}
            <p className="text-white/30 text-sm mt-2">
              Last count: {currentProduct.currentCountBottles || 0}
            </p>
          </div>

          {/* Counter - The Main Event */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="flex items-center gap-6">
              {/* Minus Button */}
              <Button
                onClick={handleDecrement}
                disabled={count === 0}
                className="w-20 h-20 rounded-full bg-[#1A4D2E] hover:bg-[#2A5D3E] border-2 border-[#D4AF37] text-[#D4AF37] disabled:opacity-30 disabled:border-white/20 disabled:text-white/20"
              >
                <Minus className="w-10 h-10" />
              </Button>

              {/* Count Display */}
              <div className="w-32 text-center">
                <span className="text-7xl font-bold text-white tabular-nums">
                  {count}
                </span>
              </div>

              {/* Plus Button */}
              <Button
                onClick={handleIncrement}
                className="w-20 h-20 rounded-full bg-[#D4AF37] hover:bg-[#E5C048] text-[#051a11]"
              >
                <Plus className="w-10 h-10" />
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-3 mt-auto">
            {/* Confirm Button - Big and Obvious */}
            <Button
              onClick={handleConfirmAndNext}
              disabled={saveCountMutation.isPending || completeSessionMutation.isPending}
              className="w-full h-16 text-xl font-bold bg-[#D4AF37] hover:bg-[#E5C048] text-[#051a11]"
            >
              {completeSessionMutation.isPending ? (
                "Saving..."
              ) : isLast ? (
                <>
                  <CheckCircle2 className="w-6 h-6 mr-2" />
                  Finish Count
                </>
              ) : (
                <>
                  <Check className="w-6 h-6 mr-2" />
                  Confirm & Next
                </>
              )}
            </Button>

            {/* Secondary Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                variant="outline"
                className="flex-1 h-12 border-[#1A4D2E] text-white/60 disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleSkip}
                disabled={isLast}
                variant="outline"
                className="flex-1 h-12 border-[#1A4D2E] text-white/60 disabled:opacity-30"
              >
                Skip
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // STEP 3: Done!
  if (step === "done") {
    const countedItems = Array.from(counts.values()).filter(c => c.counted).length;

    return (
      <div className="min-h-screen bg-[#051a11] flex flex-col items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-500/20 mb-6">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">All Done!</h1>
          <p className="text-white/60 text-lg mb-2">
            {selectedZone?.name} inventory complete
          </p>
          <p className="text-white/40">
            {countedItems} items counted
          </p>
        </div>

        <div className="w-full max-w-sm space-y-4 mt-12">
          <Button
            onClick={handleStartOver}
            className="w-full h-14 text-lg bg-[#D4AF37] hover:bg-[#E5C048] text-[#051a11] font-semibold"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Count Another Zone
          </Button>
          <Button
            onClick={() => setLocation("/inventory-dashboard")}
            variant="outline"
            className="w-full h-14 text-lg border-[#1A4D2E] text-white"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Loading state for counting step
  if (step === "counting" && !currentProduct) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#051a11]">
        <div className="text-center">
          <div className="text-[#D4AF37] animate-pulse text-xl mb-4">Loading products...</div>
          {products.length === 0 && allProducts.length > 0 && (
            <p className="text-white/40">No bottle products found in this zone.</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
