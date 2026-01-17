import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  ChevronRight,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Zone, InventorySession } from "@shared/schema";

interface ZoneWithHistory extends Zone {
  lastCompleted: string | null;
  lastCompletedSessionId: number | null;
  isStale: boolean; // true if never counted or > 1 day old
  activeSession: InventorySession | null;
}

export default function InventoryDashboardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/zones"],
  });

  const { data: sessions = [] } = useQuery<InventorySession[]>({
    queryKey: ["/api/inventory/sessions/all"],
  });

  const { data: activeSession } = useQuery<InventorySession | null>({
    queryKey: ["/api/inventory/sessions/active"],
  });

  const cancelSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await apiRequest("PATCH", `/api/inventory/sessions/${sessionId}`, { 
        status: "cancelled" 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sessions/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sessions/active"] });
      toast({
        title: "Session Cancelled",
        description: "You can now start a new inventory",
      });
    },
  });

  // Build zone data with last completed date and active session
  const zonesWithHistory: ZoneWithHistory[] = zones.map(zone => {
    const zoneSessions = sessions.filter(s => s.zoneId === zone.id);
    const completedSessions = zoneSessions.filter(s => s.status === "completed");
    const sortedCompleted = completedSessions.sort((a, b) => 
      new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
    );
    const lastSession = sortedCompleted[0] || null;
    const lastCompleted = lastSession?.completedAt || null;
    
    // Calculate if zone is stale (never counted or > 1 day old)
    let isStale = true;
    if (lastCompleted) {
      const completedDate = new Date(lastCompleted);
      const now = new Date();
      const diffMs = now.getTime() - completedDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      isStale = diffHours > 24;
    }
    
    const zoneActiveSession = zoneSessions.find(s => s.status === "in_progress") || null;
    
    return {
      ...zone,
      lastCompleted: lastCompleted ? new Date(lastCompleted).toLocaleString() : null,
      lastCompletedSessionId: lastSession?.id || null,
      isStale,
      activeSession: zoneActiveSession,
    };
  });

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const handleContinueSession = () => {
    setLocation("/inventory");
  };

  const handleStartNewForZone = (zoneId: number) => {
    // Navigate to inventory with zone pre-selected via URL param
    setLocation(`/inventory?zone=${zoneId}`);
  };

  const handleViewSession = (sessionId: number) => {
    // Navigate to view completed session
    setLocation(`/inventory?view=${sessionId}`);
  };

  const handleZoneClick = (zone: ZoneWithHistory) => {
    // If there's an active session in this zone, continue it
    if (activeSession?.zoneId === zone.id) {
      handleContinueSession();
      return;
    }
    
    // If there's any active session, don't allow starting a new one
    if (activeSession) {
      toast({
        title: "Session in Progress",
        description: "Please complete or cancel your current session first",
        variant: "destructive",
      });
      return;
    }
    
    // If zone is stale (never counted or > 1 day old), start new inventory
    if (zone.isStale) {
      handleStartNewForZone(zone.id);
    } else if (zone.lastCompletedSessionId) {
      // If zone was counted recently, view the completed inventory
      handleViewSession(zone.lastCompletedSessionId);
    } else {
      // Fallback to starting new
      handleStartNewForZone(zone.id);
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
            onClick={() => setLocation("/dashboard")}
            className="text-white/60"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-white">Inventory</h1>
            <p className="text-sm text-white/60">Zone status and history</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Active Session Banner */}
        {activeSession && (
          <Card className="bg-[#D4AF37]/10 border-2 border-[#D4AF37]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#D4AF37]" />
                  <span className="font-medium text-[#D4AF37]">Session In Progress</span>
                </div>
                <Badge variant="outline" className="border-[#D4AF37] text-[#D4AF37]">
                  {zones.find(z => z.id === activeSession.zoneId)?.name}
                </Badge>
              </div>
              <p className="text-sm text-white/60 mb-4">
                Started {formatTimeAgo(activeSession.startedAt?.toString() || null)}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleContinueSession}
                  className="flex-1 bg-[#D4AF37] text-[#051a11] font-semibold"
                  data-testid="button-continue-session"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Continue
                </Button>
                <Button
                  variant="outline"
                  onClick={() => cancelSessionMutation.mutate(activeSession.id)}
                  disabled={cancelSessionMutation.isPending}
                  className="border-red-500 text-red-400"
                  data-testid="button-cancel-session"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Count - Simplified View for Bartenders */}
        {!activeSession && (
          <Link href="/quick-count">
            <Card className="bg-gradient-to-r from-[#D4AF37]/20 to-[#1A4D2E] border-2 border-[#D4AF37] cursor-pointer hover:from-[#D4AF37]/30 transition-all">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#D4AF37] text-[#051a11]">
                  <Zap className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">Quick Count</h3>
                  <p className="text-white/60 text-sm">Count backup bottles (kegs auto-tracked)</p>
                </div>
                <ChevronRight className="w-6 h-6 text-[#D4AF37]" />
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Zone List */}
        <section>
          <h2 className="text-lg font-medium text-white mb-4">Zones</h2>
          <div className="space-y-3">
            {zonesWithHistory.map((zone) => {
              const hasActiveSession = zone.activeSession !== null;
              const isCurrentActiveZone = activeSession?.zoneId === zone.id;
              
              return (
                <Card 
                  key={zone.id}
                  className={`
                    bg-[#0a2419] border-2 overflow-visible
                    ${isCurrentActiveZone 
                      ? "border-[#D4AF37]" 
                      : "border-[#1A4D2E] hover-elevate cursor-pointer"
                    }
                  `}
                  onClick={() => handleZoneClick(zone)}
                  data-testid={`zone-card-${zone.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-white">{zone.name}</p>
                          {isCurrentActiveZone && (
                            <Badge className="bg-[#D4AF37]/20 text-[#D4AF37] border-none">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {zone.lastCompleted ? (
                            <div className="flex items-center gap-1 text-green-400">
                              <CheckCircle className="w-4 h-4" />
                              <span>{formatTimeAgo(zone.lastCompleted)}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-orange-400">
                              <AlertCircle className="w-4 h-4" />
                              <span>Never counted</span>
                            </div>
                          )}
                        </div>
                        {zone.description && (
                          <p className="text-xs text-white/40 mt-1">{zone.description}</p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/40" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Quick Start Button */}
        {!activeSession && (
          <Link href="/inventory">
            <Button
              className="w-full h-14 bg-[#1A4D2E] text-[#D4AF37] border-2 border-[#D4AF37] text-lg font-semibold"
              data-testid="button-start-new-inventory"
            >
              Start New Inventory
            </Button>
          </Link>
        )}

        {/* Recent Sessions */}
        {sessions.filter(s => s.status === "completed").length > 0 && (
          <section>
            <h2 className="text-lg font-medium text-white mb-4">Recent Sessions</h2>
            <div className="space-y-2">
              {sessions
                .filter(s => s.status === "completed")
                .sort((a, b) => 
                  new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
                )
                .slice(0, 5)
                .map((session) => {
                  const zone = zones.find(z => z.id === session.zoneId);
                  return (
                    <Card key={session.id} className="bg-[#0a2419] border border-[#1A4D2E]">
                      <CardContent className="p-3 flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{zone?.name}</p>
                          <p className="text-xs text-white/40">
                            {session.completedAt 
                              ? new Date(session.completedAt).toLocaleString() 
                              : "Unknown"
                            }
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
