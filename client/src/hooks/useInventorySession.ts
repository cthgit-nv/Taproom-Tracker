import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InventorySession, Zone } from "@shared/schema";

export interface CountData {
  productId: number;
  countedBottles: number;
  countedPartialOz: number | null;
  totalUnits: number;
  isManualEstimate: boolean;
}

export function useInventorySession(zones: Zone[]) {
  const { toast } = useToast();
  const [activeSession, setActiveSession] = useState<InventorySession | null>(null);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [counts, setCounts] = useState<Map<number, CountData>>(new Map());

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

  const finishSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await apiRequest("PATCH", `/api/inventory/sessions/${sessionId}`, { status: "completed" });
      return res.json();
    },
  });

  const saveCount = (countData: CountData) => {
    setCounts(new Map(counts.set(countData.productId, countData)));
  };

  const resetSession = () => {
    setActiveSession(null);
    setSelectedZone(null);
    setCounts(new Map());
  };

  return {
    activeSession,
    selectedZone,
    counts,
    setSelectedZone,
    startSessionMutation,
    saveCountMutation,
    finishSessionMutation,
    saveCount,
    resetSession,
  };
}
