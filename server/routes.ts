import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { pinLoginSchema, insertProductSchema } from "@shared/schema";
import { z } from "zod";
import { fetchDailySales, fetchProductCatalog, isGoTabConfigured, type GoTabSalesResult, type GoTabProduct } from "./gotab";
import { isUntappdConfigured, previewTapList, fetchFullTapList, type UntappdMenuItem } from "./untappd";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "wellstocked-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // Seed initial data
  await seedInitialData();

  // ========================
  // Authentication Routes
  // ========================
  
  // Login with PIN
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { pin } = pinLoginSchema.parse(req.body);
      
      const user = await storage.getUserByPin(pin);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid PIN" });
      }
      
      // Set session
      req.session.userId = user.id;
      
      // Return user without exposing PIN
      const { pinCode, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid PIN format" });
      }
      console.error("Login error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check session
  app.get("/api/auth/session", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json({ user: null });
      }
      
      const user = await storage.getUser(req.session.userId);
      
      if (!user) {
        req.session.destroy(() => {});
        return res.json({ user: null });
      }
      
      const { pinCode, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (error) {
      console.error("Session check error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ success: true });
    });
  });

  // ========================
  // User Routes
  // ========================
  
  app.get("/api/users", async (_req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      // Remove PIN from response
      const safeUsers = users.map(({ pinCode, ...user }) => user);
      return res.json(safeUsers);
    } catch (error) {
      console.error("Get users error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Settings Routes
  // ========================
  
  app.get("/api/settings", async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      return res.json(settings || null);
    } catch (error) {
      console.error("Get settings error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Distributors Routes
  // ========================
  
  app.get("/api/distributors", async (_req: Request, res: Response) => {
    try {
      const distributors = await storage.getAllDistributors();
      return res.json(distributors);
    } catch (error) {
      console.error("Get distributors error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Products Routes
  // ========================
  
  app.get("/api/products", async (_req: Request, res: Response) => {
    try {
      const products = await storage.getAllProducts();
      return res.json(products);
    } catch (error) {
      console.error("Get products error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Kegs Routes
  // ========================
  
  app.get("/api/kegs", async (_req: Request, res: Response) => {
    try {
      const kegs = await storage.getAllKegs();
      return res.json(kegs);
    } catch (error) {
      console.error("Get kegs error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get keg inventory summary for a product (tapped and on_deck kegs)
  app.get("/api/kegs/product/:productId/summary", async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.productId);
      const allKegs = await storage.getAllKegs();
      const productKegs = allKegs.filter(k => k.productId === productId);
      
      const tappedKegs = productKegs.filter(k => k.status === "tapped");
      const onDeckKegs = productKegs.filter(k => k.status === "on_deck");
      
      // Get tap info for tapped kegs
      const taps = await storage.getAllTaps();
      const tappedWithTaps = tappedKegs.map(keg => {
        const tap = taps.find(t => t.currentKegId === keg.id);
        const remainingPercent = keg.remainingVolOz && keg.initialVolOz 
          ? (keg.remainingVolOz / keg.initialVolOz) 
          : 0;
        return {
          kegId: keg.id,
          tapNumber: tap?.tapNumber || keg.tapNumber,
          remainingPercent,
          remainingVolOz: keg.remainingVolOz,
          initialVolOz: keg.initialVolOz,
        };
      });
      
      // Calculate total keg equivalent (on_deck = 1.0 each, tapped = remaining %)
      const onDeckTotal = onDeckKegs.length;
      const tappedTotal = tappedWithTaps.reduce((sum, k) => sum + k.remainingPercent, 0);
      
      return res.json({
        tapped: tappedWithTaps,
        onDeckCount: onDeckTotal,
        totalKegEquivalent: onDeckTotal + tappedTotal,
      });
    } catch (error) {
      console.error("Get keg summary error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Taps Routes
  // ========================
  
  app.get("/api/taps", async (_req: Request, res: Response) => {
    try {
      const taps = await storage.getAllTaps();
      return res.json(taps);
    } catch (error) {
      console.error("Get taps error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Zones Routes
  // ========================
  
  app.get("/api/zones", async (_req: Request, res: Response) => {
    try {
      const zones = await storage.getAllZones();
      return res.json(zones);
    } catch (error) {
      console.error("Get zones error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Inventory Session Routes
  // ========================
  
  // Start a new inventory session
  app.post("/api/inventory/sessions", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { zoneId } = req.body;
      
      if (!zoneId) {
        return res.status(400).json({ error: "Zone ID is required" });
      }
      
      // Check for existing active session
      const activeSession = await storage.getActiveSession(req.session.userId);
      if (activeSession) {
        return res.status(400).json({ error: "You already have an active session", session: activeSession });
      }
      
      const session = await storage.createInventorySession({
        userId: req.session.userId,
        zoneId,
        status: "in_progress",
        completedAt: null,
      });
      
      return res.json(session);
    } catch (error) {
      console.error("Create session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get active session for current user
  app.get("/api/inventory/sessions/active", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getActiveSession(req.session.userId);
      return res.json(session || null);
    } catch (error) {
      console.error("Get active session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all inventory sessions (for dashboard)
  app.get("/api/inventory/sessions/all", async (_req: Request, res: Response) => {
    try {
      const sessions = await storage.getAllInventorySessions();
      return res.json(sessions);
    } catch (error) {
      console.error("Get all sessions error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get session by ID with counts
  app.get("/api/inventory/sessions/:id", async (req: Request, res: Response) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await storage.getInventorySession(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const counts = await storage.getCountsBySession(sessionId);
      return res.json({ session, counts });
    } catch (error) {
      console.error("Get session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Complete/cancel a session
  app.patch("/api/inventory/sessions/:id", async (req: Request, res: Response) => {
    try {
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
    } catch (error) {
      console.error("Update session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Inventory Count Routes
  // ========================
  
  // Add/update a count in a session
  app.post("/api/inventory/counts", async (req: Request, res: Response) => {
    try {
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
    } catch (error) {
      console.error("Create count error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Receiving Routes
  // ========================
  
  // Look up product by UPC
  app.get("/api/products/upc/:upc", async (req: Request, res: Response) => {
    try {
      const product = await storage.getProductByUpc(req.params.upc);
      return res.json(product || null);
    } catch (error) {
      console.error("Get product by UPC error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Receive inventory - kegs go to kegs table, bottles add to backupCount
  app.post("/api/receiving", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { productId, quantity, isKeg } = req.body;
      
      if (!productId || quantity === undefined) {
        return res.status(400).json({ error: "Product ID and quantity are required" });
      }
      
      // Create receiving log
      const log = await storage.createReceivingLog({
        userId: req.session.userId,
        productId,
        quantity,
        isKeg: isKeg || false,
      });
      
      if (isKeg) {
        // For kegs, create keg record with on_deck status (cooler stock)
        // The kegs table is the source of truth for keg inventory
        await storage.createKeg({
          productId,
          status: "on_deck",
          initialVolOz: 1984, // Standard 1/2 barrel (15.5 gal = 1984 oz)
          remainingVolOz: 1984,
          dateReceived: new Date(),
          dateTapped: null,
          dateKicked: null,
        });
      } else {
        // For bottles/cans, receiving adds to backupCount (sealed inventory)
        const product = await storage.getProduct(productId);
        if (product) {
          const newBackupCount = (product.backupCount || 0) + quantity;
          await storage.updateProduct(productId, { backupCount: newBackupCount });
        }
      }
      
      return res.json(log);
    } catch (error) {
      console.error("Receive inventory error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create new product (for unknown UPCs)
  app.post("/api/products", async (req: Request, res: Response) => {
    try {
      const product = await storage.createProduct(req.body);
      return res.json(product);
    } catch (error) {
      console.error("Create product error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get single product
  app.get("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const product = await storage.getProduct(parseInt(req.params.id));
      return res.json(product || null);
    } catch (error) {
      console.error("Get product error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update product (for weights, etc.)
  app.patch("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.id);
      const { emptyWeightGrams, fullWeightGrams, ...otherFields } = req.body;
      
      const product = await storage.updateProduct(productId, {
        emptyWeightGrams,
        fullWeightGrams,
        ...otherFields,
      });
      
      return res.json(product);
    } catch (error) {
      console.error("Update product error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // GoTab Sales Integration Routes (Admin/Owner Only)
  // ========================
  
  // Check GoTab configuration status
  app.get("/api/gotab/status", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      return res.json({ 
        configured: isGoTabConfigured(),
        message: isGoTabConfigured() ? "GoTab is configured" : "GoTab credentials not set"
      });
    } catch (error) {
      console.error("GoTab status error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Sync daily sales from GoTab and update inventory
  app.post("/api/gotab/sync", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      if (!isGoTabConfigured()) {
        return res.status(400).json({ error: "GoTab not configured. Set environment variables." });
      }
      
      const { date } = req.body;
      const targetDate = date ? new Date(date) : new Date();
      
      // Fetch sales from GoTab API
      const salesData = await fetchDailySales(targetDate);
      
      // Process sales: deduct bottles/cans from inventory
      const products = await storage.getAllProducts();
      let processed = 0;
      let deducted = 0;
      const errors: string[] = [];
      
      for (const saleItem of salesData.items) {
        // Find matching product by UPC, PLU, or name
        const product = products.find(p => 
          p.upc === saleItem.sku || 
          p.plu?.toString() === saleItem.sku ||
          p.name.toLowerCase() === saleItem.name.toLowerCase()
        );
        
        if (!product) {
          errors.push(`Product not found: ${saleItem.name} (SKU: ${saleItem.sku})`);
          continue;
        }
        
        processed++;
        
        // Only deduct from bottles/cans (not draft beer which is tracked by PMB sensors)
        if (!product.isSoldByVolume && product.currentCountBottles !== null) {
          const newCount = Math.max(0, (product.currentCountBottles || 0) - saleItem.quantitySold);
          await storage.updateProduct(product.id, { currentCountBottles: newCount });
          deducted++;
        }
        // Draft beer (isSoldByVolume=true): revenue tracked but quantity comes from PMB sensors
      }
      
      return res.json({ 
        date: salesData.date,
        processed, 
        deducted,
        totalRevenue: salesData.totalRevenue,
        tabCount: salesData.tabCount,
        errors,
        message: `Synced ${processed} items, deducted ${deducted} bottle/can products` 
      });
    } catch (error) {
      console.error("GoTab sync error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  });

  // Get daily sales from GoTab (read-only, no inventory update)
  app.post("/api/gotab/daily-sales", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      if (!isGoTabConfigured()) {
        return res.status(400).json({ error: "GoTab not configured. Set environment variables." });
      }
      
      const { date } = req.body;
      const targetDate = date ? new Date(date) : new Date();
      
      const salesData = await fetchDailySales(targetDate);
      return res.json(salesData);
    } catch (error) {
      console.error("GoTab daily sales error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  });

  // Preview products from GoTab catalog (read-only)
  app.get("/api/gotab/products/preview", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || currentUser.role !== "owner") {
        return res.status(403).json({ error: "Owner access required" });
      }
      
      if (!isGoTabConfigured()) {
        return res.status(400).json({ error: "GoTab not configured" });
      }
      
      const products = await fetchProductCatalog();
      
      // Group by category for easier review
      const byCategory = new Map<string, GoTabProduct[]>();
      for (const p of products) {
        const cat = p.category || "Uncategorized";
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(p);
      }
      
      // Identify beverage products (Beer, Wine, Spirits, etc.)
      const beverageCategories = ["Beer", "Draft", "Bottles", "Cans", "Wine", "Spirits", "Cocktails", "Drinks", "Beverages"];
      const beverageProducts = products.filter(p => 
        beverageCategories.some(cat => 
          p.category?.toLowerCase().includes(cat.toLowerCase()) ||
          p.revenueAccount?.toLowerCase().includes("alcohol") ||
          p.revenueAccount?.toLowerCase().includes("beer") ||
          p.revenueAccount?.toLowerCase().includes("beverage")
        )
      );
      
      return res.json({
        totalProducts: products.length,
        beverageCount: beverageProducts.length,
        categories: Object.fromEntries(byCategory),
        beverageProducts: beverageProducts.map(p => ({
          name: p.name,
          category: p.category,
          price: p.basePrice,
          revenueAccount: p.revenueAccount,
          active: p.active,
        })),
      });
    } catch (error) {
      console.error("GoTab products preview error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  });

  // Import products from GoTab (owner only)
  app.post("/api/gotab/products/import", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || currentUser.role !== "owner") {
        return res.status(403).json({ error: "Owner access required" });
      }
      
      if (!isGoTabConfigured()) {
        return res.status(400).json({ error: "GoTab not configured" });
      }
      
      const { categoryFilter } = req.body; // Optional: only import certain categories
      
      const goTabProducts = await fetchProductCatalog();
      
      // Filter by category if specified
      let toImport = goTabProducts.filter(p => p.active);
      if (categoryFilter && Array.isArray(categoryFilter)) {
        toImport = toImport.filter(p => 
          categoryFilter.some((cat: string) => 
            p.category?.toLowerCase().includes(cat.toLowerCase())
          )
        );
      }
      
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      
      for (const gp of toImport) {
        try {
          // Check if product already exists by name
          const existingProducts = await storage.getAllProducts();
          const exists = existingProducts.some(p => 
            p.name.toLowerCase() === gp.name.toLowerCase()
          );
          
          if (exists) {
            skipped++;
            continue;
          }
          
          // Determine if this is a draft beer (sold by volume)
          const isDraft = gp.category?.toLowerCase().includes("draft") || 
                          gp.category?.toLowerCase().includes("tap");
          
          await storage.createProduct({
            name: gp.name,
            upc: gp.productUuid, // Use GoTab UUID as UPC for matching
            pricePerUnit: gp.basePrice.toFixed(2),
            isSoldByVolume: isDraft,
            category: gp.category,
            currentCountBottles: isDraft ? null : 0,
            backupCount: isDraft ? null : 0,
          });
          
          imported++;
        } catch (err) {
          errors.push(`Failed to import ${gp.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
      
      return res.json({
        imported,
        skipped,
        errors,
        message: `Imported ${imported} products, skipped ${skipped} existing`,
      });
    } catch (error) {
      console.error("GoTab import error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  });

  // ========================
  // User Management Routes (Owner Only)
  // ========================
  
  // Create new user (owner only)
  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || currentUser.role !== "owner") {
        return res.status(403).json({ error: "Owner access required" });
      }
      
      const { name, pinCode, role } = req.body;
      
      if (!name || !pinCode || !role) {
        return res.status(400).json({ error: "Name, PIN, and role are required" });
      }
      
      if (!["owner", "admin", "staff"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      
      // Check if PIN already exists
      const existingUser = await storage.getUserByPin(pinCode);
      if (existingUser) {
        return res.status(400).json({ error: "PIN already in use" });
      }
      
      const user = await storage.createUser({ name, pinCode, role });
      const { pinCode: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      console.error("Create user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Update user (owner only)
  app.patch("/api/users/:id", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || currentUser.role !== "owner") {
        return res.status(403).json({ error: "Owner access required" });
      }
      
      const userId = parseInt(req.params.id);
      const { name, pinCode, role } = req.body;
      
      // If changing PIN, check it's not in use
      if (pinCode) {
        const existingUser = await storage.getUserByPin(pinCode);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ error: "PIN already in use" });
        }
      }
      
      const user = await storage.updateUser(userId, { name, pinCode, role });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { pinCode: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      console.error("Update user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Delete user (owner only, cannot delete self)
  app.delete("/api/users/:id", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || currentUser.role !== "owner") {
        return res.status(403).json({ error: "Owner access required" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Cannot delete self
      if (userId === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }
      
      // Cannot delete other owners (safety)
      const targetUser = await storage.getUser(userId);
      if (targetUser?.role === "owner") {
        return res.status(400).json({ error: "Cannot delete owner accounts" });
      }
      
      await storage.deleteUser(userId);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Settings Routes (Owner Only for API Keys)
  // ========================
  
  // Update settings
  app.patch("/api/settings", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const { 
        gotabLocId, gotabKey, gotabSecret, 
        untappdReadToken, untappdWriteToken, untappdMenuId,
        simulationMode, ...otherFields 
      } = req.body;
      
      // API key fields require owner access
      const apiKeyFields = { gotabLocId, gotabKey, gotabSecret, untappdReadToken, untappdWriteToken, untappdMenuId };
      const hasApiKeyChanges = Object.values(apiKeyFields).some(v => v !== undefined);
      
      if (hasApiKeyChanges && currentUser.role !== "owner") {
        return res.status(403).json({ error: "Owner access required for API keys" });
      }
      
      // Simulation mode can be changed by admin or owner
      if (simulationMode !== undefined && !["owner", "admin"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Admin access required for simulation mode" });
      }
      
      const settings = await storage.updateSettings({
        ...otherFields,
        ...(hasApiKeyChanges ? apiKeyFields : {}),
        ...(simulationMode !== undefined ? { simulationMode } : {}),
      });
      
      return res.json(settings);
    } catch (error) {
      console.error("Update settings error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================
  // Untappd Integration Routes (Admin/Owner Only)
  // ========================
  
  // Check Untappd configuration status
  app.get("/api/untappd/status", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      return res.json({ 
        configured: isUntappdConfigured(),
        message: isUntappdConfigured() ? "Untappd is configured" : "Untappd credentials not set"
      });
    } catch (error) {
      console.error("Untappd status error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Preview tap list from Untappd (read-only)
  app.get("/api/untappd/taplist/preview", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      if (!isUntappdConfigured()) {
        return res.status(400).json({ error: "Untappd not configured. Set UNTAPPD_EMAIL, UNTAPPD_API_TOKEN, and UNTAPPD_LOCATION_ID." });
      }
      
      const tapList = await previewTapList();
      return res.json(tapList);
    } catch (error) {
      console.error("Untappd preview error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  });

  // Sync tap list from Untappd - creates new products for new beers
  app.post("/api/untappd/sync", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(req.session.userId);
      if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      if (!isUntappdConfigured()) {
        return res.status(400).json({ error: "Untappd not configured" });
      }
      
      const tapListItems = await fetchFullTapList();
      const existingProducts = await storage.getAllProducts();
      
      let newBeers: Array<{ name: string; brewery: string | null; style: string | null }> = [];
      let existingCount = 0;
      let updated = 0;
      const errors: string[] = [];
      
      for (const item of tapListItems) {
        try {
          // Skip items without a name
          if (!item.name || item.name.trim() === "") {
            errors.push(`Skipped item with no name (ID: ${item.id})`);
            continue;
          }
          
          // Try to find existing product by Untappd ID or name
          const existingByUntappdId = item.untappd_id 
            ? existingProducts.find(p => p.untappdId === item.untappd_id)
            : null;
          const existingByName = existingProducts.find(p => 
            p.name.toLowerCase() === item.name.toLowerCase()
          );
          
          const existing = existingByUntappdId || existingByName;
          
          if (existing) {
            existingCount++;
            
            // Update existing product with Untappd data
            await storage.updateProduct(existing.id, {
              untappdId: item.untappd_id ?? undefined,
              untappdContainerId: item.container_id?.toString() ?? undefined,
              abv: item.abv ?? undefined,
              ibu: item.ibu ?? undefined,
              style: item.style ?? undefined,
              description: item.description ?? undefined,
              labelImageUrl: item.label_image_hd || item.label_image || undefined,
              untappdRating: item.rating ?? undefined,
              untappdRatingCount: item.rating_count ?? undefined,
            });
            updated++;
          } else {
            // Create new product from Untappd
            await storage.createProduct({
              name: item.name.trim(),
              untappdId: item.untappd_id ?? undefined,
              untappdContainerId: item.container_id?.toString() ?? undefined,
              abv: item.abv ?? undefined,
              ibu: item.ibu ?? undefined,
              style: item.style ?? undefined,
              description: item.description ?? undefined,
              labelImageUrl: item.label_image_hd || item.label_image || undefined,
              isSoldByVolume: true, // Draft beers are sold by volume
              untappdRating: item.rating ?? undefined,
              untappdRatingCount: item.rating_count ?? undefined,
            });
            
            newBeers.push({
              name: item.name,
              brewery: item.brewery,
              style: item.style,
            });
          }
        } catch (err) {
          errors.push(`Failed to sync ${item.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
      
      return res.json({
        totalOnTap: tapListItems.length,
        newBeers,
        existingBeers: existingCount,
        updated,
        errors,
        message: `Synced ${tapListItems.length} beers: ${newBeers.length} new, ${existingCount} existing (${updated} updated)${errors.length > 0 ? `, ${errors.length} errors` : ''}`,
      });
    } catch (error) {
      console.error("Untappd sync error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  });

  return httpServer;
}

// Seed initial data for development/testing
async function seedInitialData() {
  try {
    // Check if users exist
    const existingUsers = await storage.getAllUsers();
    
    if (existingUsers.length === 0) {
      // Create default owner user with PIN 1234 (Super Admin)
      await storage.createUser({
        name: "Owner",
        pinCode: "1234",
        role: "owner",
      });
      
      // Create default admin user with PIN 0000 (GM)
      await storage.createUser({
        name: "Admin",
        pinCode: "0000",
        role: "admin",
      });
      
      // Create default staff user with PIN 5678
      await storage.createUser({
        name: "Staff",
        pinCode: "5678",
        role: "staff",
      });
      
      console.log("Seeded default users: Owner (PIN: 1234), Admin (PIN: 0000), Staff (PIN: 5678)");
    }

    // Check if settings exist
    const existingSettings = await storage.getSettings();
    
    if (!existingSettings) {
      await storage.createSettings({
        pmbLocalIp: null,
        pmbLocalPort: null,
        simulationMode: true,
        pluRangeStart: 1000,
        pluRangeEnd: 2000,
      });
      
      console.log("Seeded default settings");
    }

    // Seed 30 taps
    const existingTaps = await storage.getAllTaps();
    
    if (existingTaps.length === 0) {
      for (let i = 1; i <= 30; i++) {
        await storage.createTap({
          tapNumber: i,
          currentKegId: null,
          pmbTapId: null,
        });
      }
      console.log("Seeded 30 taps");
    }
  } catch (error) {
    console.error("Error seeding data:", error);
  }
}
