import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, asyncHandler } from "../middleware";

/**
 * Register reorder flags routes
 */
export function registerReorderFlagsRoutes(app: Express): void {
  app.get("/api/reorder-flags", asyncHandler(async (req: Request, res: Response) => {
    const flags = await storage.getActiveReorderFlags();
    return res.json(flags);
  }));

  app.post("/api/reorder-flags", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { productId, kegId, reason, suggestedQuantity } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }
    
    const flag = await storage.createReorderFlag({
      productId,
      kegId: kegId || null,
      flaggedById: req.session.userId!,
      reason: reason || null,
      suggestedQuantity: suggestedQuantity || 1,
    });
    
    return res.status(201).json(flag);
  }));

  app.patch("/api/reorder-flags/:id/resolve", asyncHandler(async (req: Request, res: Response) => {
    const flagId = parseInt(req.params.id);
    const { orderId } = req.body;
    
    const flag = await storage.resolveReorderFlag(flagId, orderId);
    if (!flag) {
      return res.status(404).json({ error: "Flag not found" });
    }
    
    return res.json(flag);
  }));
}
