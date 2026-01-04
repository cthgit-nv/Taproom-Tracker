import { useAuth } from "@/lib/auth-context";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Beer, RefreshCw, CheckCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface IntegrationStatus {
  configured: boolean;
  message: string;
}

interface UntappdSyncResult {
  totalOnTap: number;
  newBeers: Array<{ name: string; brewery: string | null; style: string | null }>;
  existingBeers: number;
  updated: number;
  message: string;
}

interface GoTabSyncResult {
  date: string;
  processed: number;
  deducted: number;
  totalRevenue: number;
  tabCount: number;
  errors: string[];
  message: string;
}

export default function AdminIntegrationsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: untappdStatus } = useQuery<IntegrationStatus>({
    queryKey: ["/api/untappd/status"],
    enabled: isAuthenticated && user?.role === "owner",
  });

  const { data: gotabStatus } = useQuery<IntegrationStatus>({
    queryKey: ["/api/gotab/status"],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "admin"),
  });

  const untappdSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/untappd/sync");
      return res.json() as Promise<UntappdSyncResult>;
    },
    onSuccess: (data) => {
      toast({
        title: "Untappd Sync Complete",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const gotabSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gotab/sync");
      return res.json() as Promise<GoTabSyncResult>;
    },
    onSuccess: (data) => {
      toast({
        title: "GoTab Sync Complete",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
    if (!isLoading && user && user.role !== "owner") {
      setLocation("/dashboard");
    }
  }, [isLoading, isAuthenticated, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#051a11]">
        <div className="text-[#D4AF37] animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== "owner") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#051a11]">
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="text-white/60" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-white">Integrations</h1>
            <p className="text-sm text-white/60">Manage external connections</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-4">
        <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#F0A500]/20 flex items-center justify-center">
                  <Beer className="w-5 h-5 text-[#F0A500]" />
                </div>
                <div>
                  <CardTitle className="text-white text-base">Untappd for Business</CardTitle>
                  <CardDescription className="text-white/60">Tap list sync</CardDescription>
                </div>
              </div>
              {untappdStatus?.configured ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                  <XCircle className="w-3 h-3 mr-1" />
                  Not Configured
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-white/70">
              Syncs your Untappd tap list. New beers are automatically added as products. 
              Ratings and ABV are updated for existing beers.
            </p>
            {untappdStatus?.configured ? (
              <Button
                onClick={() => untappdSyncMutation.mutate()}
                disabled={untappdSyncMutation.isPending}
                className="w-full bg-[#F0A500] text-black hover:bg-[#F0A500]/90"
                data-testid="button-sync-untappd"
              >
                {untappdSyncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync Tap List Now
              </Button>
            ) : (
              <div className="p-3 bg-[#1A4D2E]/30 rounded-lg">
                <p className="text-sm text-white/60 mb-2">Required environment variables:</p>
                <code className="text-xs text-[#D4AF37] block">UNTAPPD_EMAIL</code>
                <code className="text-xs text-[#D4AF37] block">UNTAPPD_API_TOKEN</code>
                <code className="text-xs text-[#D4AF37] block">UNTAPPD_LOCATION_ID</code>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <ExternalLink className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-white text-base">GoTab POS</CardTitle>
                  <CardDescription className="text-white/60">Sales sync</CardDescription>
                </div>
              </div>
              {gotabStatus?.configured ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                  <XCircle className="w-3 h-3 mr-1" />
                  Not Configured
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-white/70">
              Syncs daily sales from GoTab. Bottles and cans are deducted from inventory. 
              Draft beer revenue is tracked (volume from PMB sensors).
            </p>
            {gotabStatus?.configured ? (
              <Button
                onClick={() => gotabSyncMutation.mutate()}
                disabled={gotabSyncMutation.isPending}
                className="w-full bg-blue-500 text-white hover:bg-blue-500/90"
                data-testid="button-sync-gotab"
              >
                {gotabSyncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync Today's Sales
              </Button>
            ) : (
              <div className="p-3 bg-[#1A4D2E]/30 rounded-lg">
                <p className="text-sm text-white/60 mb-2">Required environment variables:</p>
                <code className="text-xs text-[#D4AF37] block">GOTAB_API_KEY</code>
                <code className="text-xs text-[#D4AF37] block">GOTAB_API_SECRET</code>
                <code className="text-xs text-[#D4AF37] block">GOTAB_LOCATION_UUID</code>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0a2419] border-2 border-[#1A4D2E] opacity-60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Beer className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-white text-base">PourMyBeer</CardTitle>
                  <CardDescription className="text-white/60">Keg sensors</CardDescription>
                </div>
              </div>
              <Badge className="bg-white/10 text-white/60 border-white/20">
                Coming Soon
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/50">
              Real-time keg level monitoring from PourMyBeer flow sensors.
              Automatically updates remaining volume on tapped kegs.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
