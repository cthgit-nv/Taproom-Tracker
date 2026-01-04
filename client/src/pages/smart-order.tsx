import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, TrendingUp, Star, MapPin, DollarSign, Trophy, Medal, Award, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Product, Keg, Distributor } from "@shared/schema";

interface ProductWithScore extends Product {
  draftPickScore: number;
  velocityScore: number;
  ratingScore: number;
  localBonus: number;
  costPenalty: number;
  onDeckCount: number;
  tappedCount: number;
  lowStock: boolean;
}

export default function SmartOrderPage() {
  const [, setLocation] = useLocation();

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: kegs = [], isLoading: kegsLoading } = useQuery<Keg[]>({
    queryKey: ["/api/kegs"],
  });

  const { data: distributors = [] } = useQuery<Distributor[]>({
    queryKey: ["/api/distributors"],
  });

  const isLoading = productsLoading || kegsLoading;

  // Calculate Draft Pick scores for each product
  const scoredProducts: ProductWithScore[] = products
    .filter(p => p.isSoldByVolume) // Only keg products
    .map(product => {
      // Count kegs by status
      const productKegs = kegs.filter(k => k.productId === product.id);
      const onDeckCount = productKegs.filter(k => k.status === "on_deck").length;
      const tappedCount = productKegs.filter(k => k.status === "tapped").length;

      // Calculate component scores
      const velocity = product.historicalVelocity || 0;
      const velocityScore = velocity * 1.5;

      const rating = product.untappdRating || 0;
      const ratingScore = rating * 10;

      const localBonus = product.isLocal ? 15 : 0;

      // Cost penalty: normalized 0-10 based on cost (higher cost = higher penalty)
      const cost = parseFloat(product.costPerUnit || "0");
      const costPenalty = Math.min(cost / 20, 10); // Max penalty of 10 for $200+ kegs

      const draftPickScore = velocityScore + ratingScore + localBonus - costPenalty;

      // Low stock: no on_deck and 1 or fewer tapped
      const lowStock = onDeckCount === 0 && tappedCount <= 1;

      return {
        ...product,
        draftPickScore,
        velocityScore,
        ratingScore,
        localBonus,
        costPenalty,
        onDeckCount,
        tappedCount,
        lowStock,
      };
    })
    .sort((a, b) => b.draftPickScore - a.draftPickScore);

  // Top performers (high score, good stock)
  const topPerformers = scoredProducts.filter(p => p.draftPickScore > 30 && !p.lowStock).slice(0, 5);

  // Reorder recommendations (high score + low stock)
  const reorderRecommendations = scoredProducts.filter(p => p.lowStock).slice(0, 10);

  // Group by distributor for ordering
  const byDistributor = reorderRecommendations.reduce((acc, product) => {
    const distId = product.distributorId || 0;
    if (!acc[distId]) {
      acc[distId] = [];
    }
    acc[distId].push(product);
    return acc;
  }, {} as Record<number, ProductWithScore[]>);

  const getDistributorName = (id: number) => {
    if (id === 0) return "Unknown Distributor";
    return distributors.find(d => d.id === id)?.name || "Unknown";
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-[#D4AF37]" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-600" />;
    return null;
  };

  const getScoreColor = (score: number) => {
    if (score >= 50) return "text-green-400";
    if (score >= 30) return "text-[#D4AF37]";
    if (score >= 15) return "text-orange-400";
    return "text-red-400";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#051a11]">
        <div className="text-[#D4AF37] animate-pulse">Calculating Draft Picks...</div>
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
            <h1 className="text-lg font-semibold text-white">Smart Order</h1>
            <p className="text-sm text-white/60">Draft Pick Algorithm</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Leaderboard */}
        <Card className="bg-[#0a2419] border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[#D4AF37] flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Draft Pick Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topPerformers.length === 0 ? (
              <p className="text-white/40 text-center py-4">No top performers yet</p>
            ) : (
              topPerformers.map((product, index) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 p-3 bg-[#051a11] rounded-lg"
                  data-testid={`leaderboard-item-${product.id}`}
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    {getRankIcon(index) || (
                      <span className="text-white/40 font-medium">#{index + 1}</span>
                    )}
                  </div>

                  {product.labelImageUrl && (
                    <img
                      src={product.labelImageUrl}
                      alt={product.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{product.name}</p>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      {product.untappdRating && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-[#D4AF37] fill-[#D4AF37]" />
                          {product.untappdRating.toFixed(1)}
                        </span>
                      )}
                      {product.isLocal && (
                        <span className="flex items-center gap-1 text-green-400">
                          <MapPin className="w-3 h-3" />
                          Local
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {(product.historicalVelocity || 0).toFixed(1)}/wk
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`font-bold ${getScoreColor(product.draftPickScore)}`}>
                      {product.draftPickScore.toFixed(0)}
                    </p>
                    <p className="text-xs text-white/40">score</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Reorder Recommendations by Distributor */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#D4AF37]" />
            Reorder Recommendations
          </h2>

          {reorderRecommendations.length === 0 ? (
            <Card className="bg-[#0a2419] border-[#1A4D2E]">
              <CardContent className="p-6 text-center">
                <p className="text-white/40">All products are well stocked!</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(byDistributor).map(([distId, products]) => (
              <Card 
                key={distId} 
                className="bg-[#0a2419] border-[#1A4D2E]"
                data-testid={`distributor-group-${distId}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-base">
                      {getDistributorName(parseInt(distId))}
                    </CardTitle>
                    <Badge variant="outline" className="border-[#D4AF37] text-[#D4AF37]">
                      {products.length} items
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover-elevate bg-[#051a11]"
                      data-testid={`reorder-item-${product.id}`}
                    >
                      {product.labelImageUrl ? (
                        <img
                          src={product.labelImageUrl}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{product.name}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              product.onDeckCount === 0
                                ? "border-red-400 text-red-400"
                                : "border-[#1A4D2E] text-white/60"
                            }`}
                          >
                            {product.onDeckCount} backup
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-[#1A4D2E] text-white/60 text-xs"
                          >
                            {product.tappedCount} tapped
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className={`font-bold text-sm ${getScoreColor(product.draftPickScore)}`}>
                            {product.draftPickScore.toFixed(0)}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/40" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Score Breakdown Legend */}
        <Card className="bg-[#0a2419] border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm">Score Formula</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-white/60">
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Velocity (kegs/week)
              </span>
              <span>x 1.5</span>
            </div>
            <div className="flex items-center justify-between text-white/60">
              <span className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#D4AF37]" />
                Untappd Rating
              </span>
              <span>x 10</span>
            </div>
            <div className="flex items-center justify-between text-white/60">
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-400" />
                Local Brewery
              </span>
              <span>+15</span>
            </div>
            <div className="flex items-center justify-between text-white/60">
              <span className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-red-400" />
                Cost (higher = penalty)
              </span>
              <span>-0 to -10</span>
            </div>
          </CardContent>
        </Card>

        {/* All Beers Ranked */}
        <Card className="bg-[#0a2419] border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center justify-between">
              <span>All Draft Beers Ranked</span>
              <Badge variant="outline" className="border-[#1A4D2E] text-white/60">
                {scoredProducts.length} beers
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {scoredProducts.map((product, index) => (
              <div
                key={product.id}
                className="flex items-center gap-3 p-2 bg-[#051a11] rounded-lg"
                data-testid={`ranked-beer-${product.id}`}
              >
                <span className="w-6 text-center text-white/40 text-sm font-mono">
                  {index + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{product.name}</p>
                  <div className="flex items-center gap-1">
                    <Progress
                      value={Math.min((product.draftPickScore / 60) * 100, 100)}
                      className="h-1.5 flex-1"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {product.lowStock && (
                    <Badge variant="outline" className="border-red-400 text-red-400 text-xs">
                      Low
                    </Badge>
                  )}
                  <span className={`font-bold text-sm ${getScoreColor(product.draftPickScore)}`}>
                    {product.draftPickScore.toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
