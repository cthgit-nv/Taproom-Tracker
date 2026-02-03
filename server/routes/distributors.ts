import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { sanitizeInput } from "../security";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware";

/**
 * Register distributor routes
 */
export function registerDistributorRoutes(app: Express): void {
  app.get("/api/distributors", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    const distributors = await storage.getAllDistributors();
    return res.json(distributors);
  }));

  // Create distributor (admin/owner only)
  app.post("/api/distributors", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const { name, email, orderMinimum } = req.body;
    
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Distributor name is required" });
    }
    
    // Sanitize inputs
    const sanitizedName = sanitizeInput(name.trim());
    const sanitizedEmail = email ? sanitizeInput(email) : null;
    
    if (!sanitizedName || sanitizedName.length < 1) {
      return res.status(400).json({ error: "Invalid distributor name" });
    }
    
    // Basic email validation
    if (sanitizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    
    const distributor = await storage.createDistributor({
      name: sanitizedName,
      email: sanitizedEmail,
      orderMinimum: orderMinimum || null,
    });
    
    return res.json(distributor);
  }));
}
