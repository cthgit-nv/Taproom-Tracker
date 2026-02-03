import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, asyncHandler, getSimulationMode } from "../middleware";

/**
 * Register inventory session and count routes
 */
export function registerInventoryRoutes(app: Express): void {
  // Start a new inventory session
  // In simulation mode, sessions are tagged to keep training data separate
  app.post("/api/inventory/sessions", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { zoneId } = req.body;
    
    if (!zoneId) {
      return res.status(400).json({ error: "Zone ID is required" });
    }
    
    // Get simulation mode setting
    const isSimulation = getSimulationMode(req);
    
    // Check for existing active session (in same mode)
    const activeSession = await storage.getActiveSession(req.session.userId!, isSimulation);
    if (activeSession) {
      return res.status(400).json({ error: "You already have an active session", session: activeSession });
    }
    
    const session = await storage.createInventorySession({
      userId: req.session.userId!,
      zoneId,
      status: "in_progress",
      completedAt: null,
      isSimulation,
    });
    
    return res.json(session);
  }));

  // Get active session for current user (filtered by current simulation mode)
  app.get("/api/inventory/sessions/active", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    // Get simulation mode setting
    const isSimulation = getSimulationMode(req);
    
    const session = await storage.getActiveSession(req.session.userId!, isSimulation);
    return res.json(session || null);
  }));

  // Get all inventory sessions (filtered by current simulation mode)
  app.get("/api/inventory/sessions/all", asyncHandler(async (req: Request, res: Response) => {
    // Get simulation mode setting
    const isSimulation = getSimulationMode(req);
    
    const sessions = await storage.getAllInventorySessions(isSimulation);
    return res.json(sessions);
  }));

  // Get session by ID with counts
  app.get("/api/inventory/sessions/:id", asyncHandler(async (req: Request, res: Response) => {
    const sessionId = parseInt(req.params.id);
    const session = await storage.getInventorySession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    const counts = await storage.getCountsBySession(sessionId);
    return res.json({ session, counts });
  }));

  // Complete/cancel a session
  app.patch("/api/inventory/sessions/:id", asyncHandler(async (req: Request, res: Response) => {
    const sessionId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (!["completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    const session = await storage.updateInventorySession(sessionId, {
      status,
      completedAt: new Date(),
    });
    
    return res.json(session);
  }));

  // ========================
  // Inventory Count Routes
  // ========================
  
  // Add/update a count in a session
  app.post("/api/inventory/counts", asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, productId, countedBottles, countedPartialOz, expectedCount, isKeg } = req.body;
    
    if (!sessionId || !productId) {
      return res.status(400).json({ error: "Session ID and Product ID are required" });
    }
    
    const count = await storage.createInventoryCount({
      sessionId,
      productId,
      countedBottles: countedBottles || 0,
      countedPartialOz: countedPartialOz || null,
      expectedCount: expectedCount || null,
    });
    
    // Get product to determine type
    const product = await storage.getProduct(productId);
    
    if (product?.isSoldByVolume) {
      // For kegs: countedBottles is the cooler stock (on_deck kegs)
      // The kegs table is the source of truth - we don't update product counts
      // Just record the observation in inventory count
    } else {
      // For bottles: 
      // - countedPartialOz represents the partial/open bottle (stored as currentCountBottles as a fraction)
      // - countedBottles is the sealed backup count (stored as backupCount)
      const partialUnits = countedPartialOz ? countedPartialOz / (product?.bottleSizeMl || 750) : 0;
      await storage.updateProduct(productId, { 
        currentCountBottles: partialUnits,
        backupCount: countedBottles || 0,
      });
    }
    
    return res.json(count);
  }));
}
