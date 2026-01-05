import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle, Shield, Database, Info, Home, Package, Beer, ShoppingCart, Settings as SettingsIcon, Plus, Truck, Calculator, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Settings, Distributor, PricingDefault } from "@shared/schema";
import { Slider } from "@/components/ui/slider";
import { DollarSign } from "lucide-react";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // State for new distributor form
  const [newDistributorName, setNewDistributorName] = useState("");
  const [newDistributorEmail, setNewDistributorEmail] = useState("");
  const [showAddDistributor, setShowAddDistributor] = useState(false);
  
  // State for score formula editing
  const [editingFormula, setEditingFormula] = useState(false);
  const [velocityWeight, setVelocityWeight] = useState(0.4);
  const [ratingWeight, setRatingWeight] = useState(0.3);
  const [localWeight, setLocalWeight] = useState(0.2);
  const [profitWeight, setProfitWeight] = useState(0.1);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });
  
  const { data: distributors = [] } = useQuery<Distributor[]>({
    queryKey: ["/api/distributors"],
  });

  const { data: pricingDefaults = [] } = useQuery<PricingDefault[]>({
    queryKey: ["/api/pricing-defaults"],
  });

  const [editingPricingDefault, setEditingPricingDefault] = useState<PricingDefault | null>(null);
  const [editPourCost, setEditPourCost] = useState(22);

  const createDistributorMutation = useMutation({
    mutationFn: async ({ name, email }: { name: string; email?: string }) => {
      const res = await apiRequest("POST", "/api/distributors", { name, email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/distributors"] });
      setNewDistributorName("");
      setNewDistributorEmail("");
      setShowAddDistributor(false);
      toast({ title: "Distributor Added", description: "New distributor created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add distributor", variant: "destructive" });
    },
  });

  const updateScoreFormulaMutation = useMutation({
    mutationFn: async (weights: { scoreVelocityWeight: number; scoreRatingWeight: number; scoreLocalWeight: number; scoreProfitWeight: number }) => {
      return apiRequest("PATCH", "/api/settings", weights);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setEditingFormula(false);
      toast({ title: "Formula Updated", description: "Smart Order score formula saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update formula", variant: "destructive" });
    },
  });

  const updatePricingDefaultMutation = useMutation({
    mutationFn: async (data: { beverageType: string; pricingMode: string; targetPourCost: number }) => {
      return apiRequest("POST", "/api/pricing-defaults", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-defaults"] });
      setEditingPricingDefault(null);
      toast({ title: "Updated", description: "Default pour cost saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update default", variant: "destructive" });
    },
  });

  const toggleSimulationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", "/api/settings", { simulationMode: enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: settings?.simulationMode ? "Simulation Disabled" : "Simulation Enabled",
        description: settings?.simulationMode 
          ? "Back to production mode" 
          : "Training data will be kept separate",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update simulation mode",
        variant: "destructive",
      });
    },
  });

  if (!user) {
    setLocation("/");
    return null;
  }

  const isOwner = user.role === "owner";

  return (
    <div className="min-h-screen bg-[#051a11] pb-24">
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">Settings</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {isOwner && (
          <Card className="bg-[#0a2419] border-2 border-orange-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-orange-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Simulation Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-white/60">
                Enable simulation mode for staff training. All inventory changes will be tracked separately and won't affect real data.
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    {settings?.simulationMode ? "Active" : "Disabled"}
                  </span>
                  {settings?.simulationMode && (
                    <Badge variant="outline" className="border-orange-500 text-orange-400 text-xs">
                      Training Mode
                    </Badge>
                  )}
                </div>
                <Switch
                  checked={settings?.simulationMode ?? false}
                  onCheckedChange={(checked) => toggleSimulationMutation.mutate(checked)}
                  disabled={isLoading || toggleSimulationMutation.isPending}
                  data-testid="switch-simulation-mode"
                />
              </div>
              {settings?.simulationMode && (
                <div className="bg-orange-500/10 rounded-md p-2 border border-orange-500/30">
                  <p className="text-xs text-orange-300 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Receiving, keg changes, and counts won't affect real inventory
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#D4AF37]" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Logged in as</span>
              <span className="text-white font-medium">{user.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">Role</span>
              <Badge 
                variant="outline" 
                className={
                  user.role === "owner" 
                    ? "border-[#D4AF37] text-[#D4AF37]"
                    : user.role === "admin"
                    ? "border-blue-500 text-blue-400"
                    : "border-[#1A4D2E] text-[#1A4D2E]"
                }
              >
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </Badge>
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-2 border-red-500/50 text-red-400"
              onClick={logout}
              data-testid="button-logout"
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>

        {/* Distributor Management - Admin/Owner only */}
        {(user.role === "admin" || user.role === "owner") && (
          <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#D4AF37]" />
                Distributors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-white/60">
                Manage distributors for product ordering and inventory tracking.
              </p>
              
              {distributors.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {distributors.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-white">{d.name}</span>
                      {d.email && <span className="text-white/40 text-xs">{d.email}</span>}
                    </div>
                  ))}
                </div>
              )}
              
              {showAddDistributor ? (
                <div className="space-y-2 p-3 bg-[#051a11] rounded-md">
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">Name *</Label>
                    <Input
                      value={newDistributorName}
                      onChange={(e) => setNewDistributorName(e.target.value)}
                      placeholder="Distributor name"
                      className="bg-[#0a2419] border-[#1A4D2E] text-white"
                      data-testid="input-distributor-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">Email (optional)</Label>
                    <Input
                      value={newDistributorEmail}
                      onChange={(e) => setNewDistributorEmail(e.target.value)}
                      placeholder="orders@distributor.com"
                      className="bg-[#0a2419] border-[#1A4D2E] text-white"
                      data-testid="input-distributor-email"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (newDistributorName.trim()) {
                          createDistributorMutation.mutate({
                            name: newDistributorName.trim(),
                            email: newDistributorEmail.trim() || undefined,
                          });
                        }
                      }}
                      disabled={!newDistributorName.trim() || createDistributorMutation.isPending}
                      className="flex-1 bg-[#1A4D2E]"
                      data-testid="button-save-distributor"
                    >
                      {createDistributorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAddDistributor(false)}
                      className="text-white/60"
                      data-testid="button-cancel-distributor"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full border-[#1A4D2E] text-white/80"
                  onClick={() => setShowAddDistributor(true)}
                  data-testid="button-add-distributor"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Distributor
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Smart Order Score Formula - Admin/Owner only */}
        {(user.role === "admin" || user.role === "owner") && (
          <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Calculator className="w-5 h-5 text-[#D4AF37]" />
                Smart Order Score Formula
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-white/60">
                Adjust the weights used to calculate the Draft Pick score for ordering recommendations.
              </p>
              
              {editingFormula ? (
                <div className="space-y-3 p-3 bg-[#051a11] rounded-md">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-white/80 text-sm">Velocity (Sales Speed)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={velocityWeight}
                        onChange={(e) => setVelocityWeight(parseFloat(e.target.value) || 0)}
                        className="w-20 bg-[#0a2419] border-[#1A4D2E] text-white text-right"
                        data-testid="input-velocity-weight"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-white/80 text-sm">Rating (Untappd Score)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={ratingWeight}
                        onChange={(e) => setRatingWeight(parseFloat(e.target.value) || 0)}
                        className="w-20 bg-[#0a2419] border-[#1A4D2E] text-white text-right"
                        data-testid="input-rating-weight"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-white/80 text-sm">Local (Support Local)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={localWeight}
                        onChange={(e) => setLocalWeight(parseFloat(e.target.value) || 0)}
                        className="w-20 bg-[#0a2419] border-[#1A4D2E] text-white text-right"
                        data-testid="input-local-weight"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-white/80 text-sm">Profit Margin</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={profitWeight}
                        onChange={(e) => setProfitWeight(parseFloat(e.target.value) || 0)}
                        className="w-20 bg-[#0a2419] border-[#1A4D2E] text-white text-right"
                        data-testid="input-profit-weight"
                      />
                    </div>
                  </div>
                  
                  <div className="text-xs text-white/40 text-center">
                    Total: {(velocityWeight + ratingWeight + localWeight + profitWeight).toFixed(1)}
                    {Math.abs(velocityWeight + ratingWeight + localWeight + profitWeight - 1) > 0.01 && (
                      <span className="text-orange-400 ml-2">(Should equal 1.0)</span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateScoreFormulaMutation.mutate({
                        scoreVelocityWeight: velocityWeight,
                        scoreRatingWeight: ratingWeight,
                        scoreLocalWeight: localWeight,
                        scoreProfitWeight: profitWeight,
                      })}
                      disabled={updateScoreFormulaMutation.isPending}
                      className="flex-1 bg-[#1A4D2E]"
                      data-testid="button-save-formula"
                    >
                      {updateScoreFormulaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingFormula(false)}
                      className="text-white/60"
                      data-testid="button-cancel-formula"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-white/60">Velocity:</span>
                    <span className="text-white text-right">{settings?.scoreVelocityWeight ?? 0.4}</span>
                    <span className="text-white/60">Rating:</span>
                    <span className="text-white text-right">{settings?.scoreRatingWeight ?? 0.3}</span>
                    <span className="text-white/60">Local:</span>
                    <span className="text-white text-right">{settings?.scoreLocalWeight ?? 0.2}</span>
                    <span className="text-white/60">Profit:</span>
                    <span className="text-white text-right">{settings?.scoreProfitWeight ?? 0.1}</span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full border-[#1A4D2E] text-white/80 mt-2"
                    onClick={() => {
                      setVelocityWeight(settings?.scoreVelocityWeight ?? 0.4);
                      setRatingWeight(settings?.scoreRatingWeight ?? 0.3);
                      setLocalWeight(settings?.scoreLocalWeight ?? 0.2);
                      setProfitWeight(settings?.scoreProfitWeight ?? 0.1);
                      setEditingFormula(true);
                    }}
                    data-testid="button-edit-formula"
                  >
                    Edit Formula
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(user.role === "admin" || user.role === "owner") && (
          <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#D4AF37]" />
                Default Pour Costs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-white/60">
                Set default target pour costs by beverage type. Staff can adjust when putting items for sale.
              </p>
              
              <div className="space-y-2">
                {pricingDefaults.map(pd => {
                  const modeLabel = pd.pricingMode === "draft_per_oz" ? "Draft" 
                    : pd.pricingMode === "package_unit" ? "Package" 
                    : pd.pricingMode === "bottle_pour" ? "Bottle/Pour" 
                    : "Shot";
                  
                  const isEditing = editingPricingDefault?.id === pd.id;
                  
                  return (
                    <div 
                      key={pd.id} 
                      className={`p-3 rounded-md ${isEditing ? "bg-[#051a11]" : "bg-[#051a11]/50"}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white capitalize">{pd.beverageType}</span>
                          <span className="text-white/40 text-xs">({modeLabel})</span>
                        </div>
                        {!isEditing && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-white/60 h-7"
                            onClick={() => {
                              setEditingPricingDefault(pd);
                              setEditPourCost(Math.round(pd.targetPourCost * 100));
                            }}
                            data-testid={`button-edit-pricing-${pd.id}`}
                          >
                            {Math.round(pd.targetPourCost * 100)}%
                          </Button>
                        )}
                      </div>
                      
                      {isEditing && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-white/60 text-sm">Target Pour Cost</span>
                            <span className="text-white font-medium">{editPourCost}%</span>
                          </div>
                          <Slider
                            value={[editPourCost]}
                            onValueChange={(v) => setEditPourCost(v[0])}
                            min={15}
                            max={35}
                            step={1}
                            className="py-2"
                            data-testid={`slider-pricing-${pd.id}`}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-[#1A4D2E]"
                              onClick={() => updatePricingDefaultMutation.mutate({
                                beverageType: pd.beverageType,
                                pricingMode: pd.pricingMode,
                                targetPourCost: editPourCost / 100,
                              })}
                              disabled={updatePricingDefaultMutation.isPending}
                              data-testid={`button-save-pricing-${pd.id}`}
                            >
                              {updatePricingDefaultMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-white/60"
                              onClick={() => setEditingPricingDefault(null)}
                              data-testid={`button-cancel-pricing-${pd.id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#0a2419] border-2 border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#D4AF37]" />
              App Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Version</span>
              <span className="text-white/80 text-sm">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">Environment</span>
              <span className="text-white/80 text-sm">Production</span>
            </div>
          </CardContent>
        </Card>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a2419] border-t border-[#1A4D2E] px-2 py-2 safe-area-pb">
        <div className="flex items-center justify-around">
          <NavItem icon={Home} label="Dashboard" href="/dashboard" />
          <NavItem icon={Package} label="Products" href="/products" />
          <NavItem icon={Beer} label="Kegs" href="/kegs" />
          <NavItem icon={ShoppingCart} label="Orders" href="/smart-order" />
          <NavItem icon={SettingsIcon} label="Settings" active />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ 
  icon: Icon, 
  label, 
  active = false,
  href
}: { 
  icon: typeof Home; 
  label: string; 
  active?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`
        flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[64px]
        transition-colors duration-150
        ${active 
          ? "text-[#D4AF37]" 
          : "text-white/50"
        }
      `}
      data-testid={`nav-${label.toLowerCase()}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-medium">{label}</span>
      {active && (
        <div className="w-1 h-1 rounded-full bg-[#D4AF37] mt-0.5" />
      )}
    </div>
  );
  
  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  
  return <button>{content}</button>;
}
