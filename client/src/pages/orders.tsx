import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle,
  Send,
  Trash2,
  Flag,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order, OrderItem, ReorderFlag, Product, Distributor } from "@shared/schema";

type OrderWithDetails = Order & {
  distributor?: Distributor;
  items?: OrderItem[];
};

const ORDER_STATUSES = [
  { value: "draft", label: "Draft", icon: Clock, color: "bg-gray-500" },
  { value: "submitted", label: "Submitted", icon: Send, color: "bg-blue-500" },
  { value: "confirmed", label: "Confirmed", icon: CheckCircle, color: "bg-green-500" },
  { value: "partially_received", label: "Partial", icon: Package, color: "bg-yellow-500" },
  { value: "received", label: "Received", icon: CheckCircle, color: "bg-emerald-500" },
  { value: "cancelled", label: "Cancelled", icon: AlertTriangle, color: "bg-red-500" },
] as const;

const UNIT_TYPES = [
  { value: "keg", label: "Keg" },
  { value: "case", label: "Case" },
  { value: "each", label: "Each" },
];

export default function OrdersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showNewOrderDialog, setShowNewOrderDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [newOrderDistributorId, setNewOrderDistributorId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [newItemProductId, setNewItemProductId] = useState<string>("");
  const [newItemQuantity, setNewItemQuantity] = useState<string>("1");
  const [newItemUnitType, setNewItemUnitType] = useState<string>("keg");
  const [newItemUnitCost, setNewItemUnitCost] = useState<string>("");
  const [newItemNote, setNewItemNote] = useState<string>("");

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const { data: reorderFlags = [] } = useQuery<ReorderFlag[]>({
    queryKey: ["/api/reorder-flags"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: distributors = [] } = useQuery<Distributor[]>({
    queryKey: ["/api/distributors"],
  });

  const { data: selectedOrderItems = [] } = useQuery<OrderItem[]>({
    queryKey: ["/api/orders", selectedOrderId, "items"],
    enabled: !!selectedOrderId,
    queryFn: async () => {
      const res = await fetch(`/api/orders/${selectedOrderId}/items`);
      if (!res.ok) throw new Error("Failed to fetch order items");
      return res.json();
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: { distributorId: number }) => {
      const res = await apiRequest("POST", "/api/orders", data);
      return res.json();
    },
    onSuccess: (newOrder: Order) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setShowNewOrderDialog(false);
      setNewOrderDistributorId("");
      setSelectedOrderId(newOrder.id);
      toast({ title: "Order created", description: "New draft order started" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create order", variant: "destructive" });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<Order>) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update order", variant: "destructive" });
    },
  });

  const addOrderItemMutation = useMutation({
    mutationFn: async (data: { orderId: number; productId: number; quantity: number; unitType: string; unitCost?: string; note?: string }) => {
      const res = await apiRequest("POST", `/api/orders/${data.orderId}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedOrderId, "items"] });
      setShowAddItemDialog(false);
      resetItemForm();
      toast({ title: "Item added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add item", variant: "destructive" });
    },
  });

  const deleteOrderItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest("DELETE", `/api/order-items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedOrderId, "items"] });
      toast({ title: "Item removed" });
    },
  });

  const resetItemForm = () => {
    setNewItemProductId("");
    setNewItemQuantity("1");
    setNewItemUnitType("keg");
    setNewItemUnitCost("");
    setNewItemNote("");
  };

  if (!user) {
    setLocation("/");
    return null;
  }

  const getDistributor = (distributorId: number | null) => 
    distributors.find(d => d.id === distributorId);

  const getProduct = (productId: number) => 
    products.find(p => p.id === productId);

  const getStatusInfo = (status: string) => 
    ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];

  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  const selectedDistributor = selectedOrder ? getDistributor(selectedOrder.distributorId) : null;

  const filteredOrders = statusFilter === "all" 
    ? orders 
    : orders.filter(o => o.status === statusFilter);

  const calculateOrderTotal = (items: OrderItem[]) => {
    return items.reduce((sum, item) => {
      const cost = parseFloat(item.unitCost || "0");
      return sum + (cost * item.quantity);
    }, 0);
  };

  const handleSubmitOrder = () => {
    if (!selectedOrderId) return;
    updateOrderMutation.mutate({ id: selectedOrderId, status: "submitted" as any });
  };

  const handleMarkReceived = () => {
    if (!selectedOrderId) return;
    updateOrderMutation.mutate({ id: selectedOrderId, status: "received" as any });
  };

  return (
    <div className="min-h-screen bg-[#051a11] pb-24">
      <header className="sticky top-0 z-50 bg-[#051a11] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">Orders</h1>
            <p className="text-sm text-white/60">{orders.length} orders</p>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowNewOrderDialog(true)}
            data-testid="button-new-order"
            className="bg-[#1A4D2E]"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Order
          </Button>
        </div>
      </header>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          {reorderFlags.length > 0 && (
            <Card className="bg-[#0a2818] border-[#1A4D2E]">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Flag className="w-4 h-4 text-[#D4AF37]" />
                  Flagged for Reorder ({reorderFlags.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {reorderFlags.map(flag => {
                  const product = getProduct(flag.productId);
                  return (
                    <div
                      key={flag.id}
                      className="flex items-center justify-between p-2 bg-[#051a11] rounded-md"
                      data-testid={`flag-item-${flag.id}`}
                    >
                      <div>
                        <p className="text-white text-sm">{product?.name || "Unknown"}</p>
                        {flag.reason && (
                          <p className="text-white/50 text-xs">{flag.reason}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[#D4AF37] border-[#D4AF37]">
                        x{flag.suggestedQuantity}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2 mb-2">
            <Label className="text-white/60 text-sm">Status:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 bg-[#0a2818] border-[#1A4D2E] text-white" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {ORDER_STATUSES.map(status => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {ordersLoading ? (
              <div className="text-white/60 text-center py-8">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-white/60 text-center py-8">
                No orders found. Create one to get started.
              </div>
            ) : (
              filteredOrders.map(order => {
                const distributor = getDistributor(order.distributorId);
                const statusInfo = getStatusInfo(order.status);
                const StatusIcon = statusInfo.icon;
                const isSelected = selectedOrderId === order.id;

                return (
                  <Card
                    key={order.id}
                    className={`cursor-pointer transition-colors ${
                      isSelected 
                        ? "bg-[#1A4D2E] border-[#D4AF37]" 
                        : "bg-[#0a2818] border-[#1A4D2E] hover-elevate"
                    }`}
                    onClick={() => setSelectedOrderId(order.id)}
                    data-testid={`order-card-${order.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">
                            {distributor?.name || "Unknown Distributor"}
                          </p>
                          <p className="text-white/50 text-xs">
                            #{order.id} - {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge className={`${statusInfo.color} text-white shrink-0`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                      </div>
                      {order.totalCost && (
                        <p className="text-[#D4AF37] text-sm mt-2">
                          ${parseFloat(order.totalCost).toFixed(2)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedOrder ? (
            <Card className="bg-[#0a2818] border-[#1A4D2E]">
              <CardHeader className="border-b border-[#1A4D2E]">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-white">
                      Order #{selectedOrder.id}
                    </CardTitle>
                    <p className="text-white/50 text-sm mt-1">
                      {selectedDistributor?.name || "Unknown Distributor"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedOrder.status === "draft" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddItemDialog(true)}
                          data-testid="button-add-item"
                          className="border-[#1A4D2E] text-white"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Item
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSubmitOrder}
                          disabled={selectedOrderItems.length === 0 || updateOrderMutation.isPending}
                          data-testid="button-submit-order"
                          className="bg-[#1A4D2E]"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Submit
                        </Button>
                      </>
                    )}
                    {(selectedOrder.status === "submitted" || selectedOrder.status === "confirmed") && (
                      <Button
                        size="sm"
                        onClick={handleMarkReceived}
                        disabled={updateOrderMutation.isPending}
                        data-testid="button-mark-received"
                        className="bg-emerald-600"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Mark Received
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {selectedOrderItems.length === 0 ? (
                  <div className="text-center py-8 text-white/50">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No items in this order yet.</p>
                    {selectedOrder.status === "draft" && (
                      <Button
                        variant="ghost"
                        onClick={() => setShowAddItemDialog(true)}
                        className="text-[#D4AF37] mt-2"
                        data-testid="button-add-first-item"
                      >
                        Add your first item
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedOrderItems.map(item => {
                      const product = getProduct(item.productId);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 bg-[#051a11] rounded-md gap-2"
                          data-testid={`order-item-${item.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">
                              {product?.name || "Unknown Product"}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-white/70 border-white/30">
                                {item.quantity}x {UNIT_TYPES.find(u => u.value === item.unitType)?.label || item.unitType}
                              </Badge>
                              {item.unitCost && (
                                <span className="text-[#D4AF37] text-sm">
                                  ${parseFloat(item.unitCost).toFixed(2)} each
                                </span>
                              )}
                            </div>
                            {item.note && (
                              <p className="text-white/50 text-xs mt-1">{item.note}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {item.unitCost && (
                              <span className="text-white font-medium">
                                ${(parseFloat(item.unitCost) * item.quantity).toFixed(2)}
                              </span>
                            )}
                            {selectedOrder.status === "draft" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteOrderItemMutation.mutate(item.id)}
                                data-testid={`button-delete-item-${item.id}`}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div className="border-t border-[#1A4D2E] pt-3 mt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-white/70">Order Total:</span>
                        <span className="text-[#D4AF37] text-xl font-bold">
                          ${calculateOrderTotal(selectedOrderItems).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedOrder.notes && (
                  <div className="mt-4 p-3 bg-[#051a11] rounded-md">
                    <Label className="text-white/50 text-xs">Notes</Label>
                    <p className="text-white text-sm">{selectedOrder.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-white/50">
              <div className="text-center">
                <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Select an order to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showNewOrderDialog} onOpenChange={setShowNewOrderDialog}>
        <DialogContent className="bg-[#0a2818] border-[#1A4D2E]">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white/70">Distributor</Label>
              <Select value={newOrderDistributorId} onValueChange={setNewOrderDistributorId}>
                <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white mt-1" data-testid="select-distributor">
                  <SelectValue placeholder="Select distributor" />
                </SelectTrigger>
                <SelectContent>
                  {distributors.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewOrderDialog(false)}
              className="border-[#1A4D2E] text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createOrderMutation.mutate({ distributorId: parseInt(newOrderDistributorId) })}
              disabled={!newOrderDistributorId || createOrderMutation.isPending}
              className="bg-[#1A4D2E]"
              data-testid="button-create-order"
            >
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="bg-[#0a2818] border-[#1A4D2E]">
          <DialogHeader>
            <DialogTitle className="text-white">Add Item to Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white/70">Product</Label>
              <Select value={newItemProductId} onValueChange={setNewItemProductId}>
                <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white mt-1" data-testid="select-product">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {products
                    .filter(p => !selectedDistributor || p.distributorId === selectedDistributor.id || !p.distributorId)
                    .map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white/70">Quantity</Label>
                <Input
                  type="number"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  min="1"
                  className="bg-[#051a11] border-[#1A4D2E] text-white mt-1"
                  data-testid="input-quantity"
                />
              </div>
              <div>
                <Label className="text-white/70">Unit Type</Label>
                <Select value={newItemUnitType} onValueChange={setNewItemUnitType}>
                  <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white mt-1" data-testid="select-unit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map(u => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-white/70">Unit Cost ($)</Label>
              <Input
                type="number"
                value={newItemUnitCost}
                onChange={(e) => setNewItemUnitCost(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="bg-[#051a11] border-[#1A4D2E] text-white mt-1"
                data-testid="input-unit-cost"
              />
            </div>

            <div>
              <Label className="text-white/70">Note (optional)</Label>
              <Textarea
                value={newItemNote}
                onChange={(e) => setNewItemNote(e.target.value)}
                placeholder="Any special instructions..."
                className="bg-[#051a11] border-[#1A4D2E] text-white mt-1 resize-none"
                data-testid="input-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddItemDialog(false);
                resetItemForm();
              }}
              className="border-[#1A4D2E] text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedOrderId || !newItemProductId) return;
                addOrderItemMutation.mutate({
                  orderId: selectedOrderId,
                  productId: parseInt(newItemProductId),
                  quantity: parseInt(newItemQuantity) || 1,
                  unitType: newItemUnitType,
                  unitCost: newItemUnitCost || undefined,
                  note: newItemNote || undefined,
                });
              }}
              disabled={!newItemProductId || addOrderItemMutation.isPending}
              className="bg-[#1A4D2E]"
              data-testid="button-add-item-confirm"
            >
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a2818] border-t border-[#1A4D2E] px-4 py-2 z-50">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <Link href="/dashboard">
            <Button variant="ghost" className="flex-col gap-1 h-auto py-2 text-white/60" data-testid="nav-home">
              <Package className="w-5 h-5" />
              <span className="text-xs">Home</span>
            </Button>
          </Link>
          <Link href="/kegs">
            <Button variant="ghost" className="flex-col gap-1 h-auto py-2 text-white/60" data-testid="nav-kegs">
              <Package className="w-5 h-5" />
              <span className="text-xs">Kegs</span>
            </Button>
          </Link>
          <Button variant="ghost" className="flex-col gap-1 h-auto py-2 text-[#D4AF37]" data-testid="nav-orders">
            <ShoppingCart className="w-5 h-5" />
            <span className="text-xs">Orders</span>
          </Button>
          <Link href="/settings">
            <Button variant="ghost" className="flex-col gap-1 h-auto py-2 text-white/60" data-testid="nav-settings">
              <Package className="w-5 h-5" />
              <span className="text-xs">Settings</span>
            </Button>
          </Link>
        </div>
      </nav>
    </div>
  );
}
