import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, asyncHandler } from "../middleware";

/**
 * Register orders and order items routes
 */
export function registerOrderRoutes(app: Express): void {
  app.get("/api/orders", asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const orders = await storage.getAllOrders(status);
    return res.json(orders);
  }));

  app.get("/api/orders/:id", asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id);
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    return res.json(order);
  }));

  app.post("/api/orders", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { distributorId, notes } = req.body;
    if (!distributorId) {
      return res.status(400).json({ error: "Distributor ID is required" });
    }
    
    const order = await storage.createOrder({
      distributorId,
      createdById: req.session.userId!,
      notes: notes || null,
      status: "draft",
    });
    
    return res.status(201).json(order);
  }));

  app.patch("/api/orders/:id", asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id);
    const { status, notes, expectedDeliveryDate, totalCost } = req.body;
    
    const updateData: Record<string, any> = {};
    if (status) {
      updateData.status = status;
      if (status === "submitted") updateData.submittedAt = new Date();
      if (status === "received") updateData.receivedAt = new Date();
    }
    if (notes !== undefined) updateData.notes = notes;
    if (expectedDeliveryDate) updateData.expectedDeliveryDate = new Date(expectedDeliveryDate);
    if (totalCost !== undefined) updateData.totalCost = totalCost;
    
    const order = await storage.updateOrder(orderId, updateData);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    return res.json(order);
  }));

  // ========================
  // Order Items Routes
  // ========================

  app.get("/api/orders/:orderId/items", asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId);
    const items = await storage.getOrderItems(orderId);
    return res.json(items);
  }));

  app.post("/api/orders/:orderId/items", asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId);
    const { productId, quantity, unitType, unitCost, note, sourceFlagId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }
    
    const item = await storage.createOrderItem({
      orderId,
      productId,
      quantity: quantity || 1,
      unitType: unitType || "keg",
      unitCost: unitCost || null,
      note: note || null,
      sourceFlagId: sourceFlagId || null,
    });
    
    if (sourceFlagId) {
      await storage.resolveReorderFlag(sourceFlagId, orderId);
    }
    
    return res.status(201).json(item);
  }));

  app.patch("/api/order-items/:id", asyncHandler(async (req: Request, res: Response) => {
    const itemId = parseInt(req.params.id);
    const { quantity, unitType, unitCost, note } = req.body;
    
    const updateData: Record<string, any> = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (unitType) updateData.unitType = unitType;
    if (unitCost !== undefined) updateData.unitCost = unitCost;
    if (note !== undefined) updateData.note = note;
    
    const item = await storage.updateOrderItem(itemId, updateData);
    if (!item) {
      return res.status(404).json({ error: "Order item not found" });
    }
    
    return res.json(item);
  }));

  app.delete("/api/order-items/:id", asyncHandler(async (req: Request, res: Response) => {
    const itemId = parseInt(req.params.id);
    await storage.deleteOrderItem(itemId);
    return res.status(204).send();
  }));
}
