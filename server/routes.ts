import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { pinLoginSchema, insertProductSchema } from "@shared/schema";
import { z } from "zod";

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
        // - countedBottles is the sealed backup count (stored as backupKegCount)
        const partialUnits = countedPartialOz ? countedPartialOz / (product?.bottleSizeMl || 750) : 0;
        await storage.updateProduct(productId, { 
          currentCountBottles: partialUnits,
          backupKegCount: countedBottles || 0,
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

  // Receive inventory - kegs go to kegs table, bottles add to backupKegCount
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
        // For bottles/cans, receiving adds to backupKegCount (sealed inventory)
        const product = await storage.getProduct(productId);
        if (product) {
          const newBackupCount = (product.backupKegCount || 0) + quantity;
          await storage.updateProduct(productId, { backupKegCount: newBackupCount });
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

  return httpServer;
}

// Seed initial data for development/testing
async function seedInitialData() {
  try {
    // Check if users exist
    const existingUsers = await storage.getAllUsers();
    
    if (existingUsers.length === 0) {
      // Create default admin user with PIN 1234
      await storage.createUser({
        name: "Admin",
        pinCode: "1234",
        role: "admin",
      });
      
      // Create default staff user with PIN 5678
      await storage.createUser({
        name: "Staff",
        pinCode: "5678",
        role: "staff",
      });
      
      console.log("Seeded default users: Admin (PIN: 1234), Staff (PIN: 5678)");
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
