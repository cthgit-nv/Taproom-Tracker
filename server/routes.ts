import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { pinLoginSchema, insertProductSchema, updateProductSchema, insertPricingDefaultSchema } from "@shared/schema";
import { z } from "zod";
import { fetchDailySales, fetchProductCatalog, isGoTabConfigured, type GoTabSalesResult, type GoTabProduct } from "./gotab";
import { isUntappdConfigured, previewTapList, fetchFullTapList, type UntappdMenuItem } from "./untappd";
import { isBarcodeSpiderConfigured, getApiStatus as getBarcodeSpiderStatus } from "./barcodespider";
import { lookupUpc as lookupUpcOrchestrator, getLookupStatus } from "./upcLookup";
import { rateLimit, hashPin, verifyPin, sanitizeInput } from "./security";
import { requireAuth, requireAdmin, requireOwner, asyncHandler, attachSettings, getSimulationMode } from "./middleware";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId?: number;
    tempUserId?: string; // Temporary storage for two-step login
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Security: Require SESSION_SECRET in production
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }
  if (!sessionSecret) {
    console.warn("WARNING: Using default session secret. Set SESSION_SECRET environment variable in production!");
  }

  // Session middleware
  app.use(
    session({
      secret: sessionSecret || "wellstocked-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
      name: "taproom.session", // Don't use default 'connect.sid'
    })
  );

  // Seed initial data
  await seedInitialData();

  // Attach settings to all requests (cached)
  app.use(attachSettings);

  // ========================
  // Authentication Routes
  // ========================
  const { registerAuthRoutes } = await import("./routes/auth");
  registerAuthRoutes(app);

  // ========================
  // User Routes
  // ========================
  const { registerUserRoutes } = await import("./routes/users");
  registerUserRoutes(app);

  // ========================
  // Settings Routes
  // ========================
  const { registerSettingsRoutes } = await import("./routes/settings");
  registerSettingsRoutes(app);

  // ========================
  // Distributors Routes
  // ========================
  const { registerDistributorRoutes } = await import("./routes/distributors");
  registerDistributorRoutes(app);

  // ========================
  // Products Routes
  // ========================
  const { registerProductRoutes } = await import("./routes/products");
  registerProductRoutes(app);

  // ========================
  // Kegs Routes
  // ========================
  const { registerKegRoutes } = await import("./routes/kegs");
  registerKegRoutes(app);

  // ========================
  // Taps & Zones Routes
  // ========================
  const { registerTapsZonesRoutes } = await import("./routes/taps-zones");
  registerTapsZonesRoutes(app);

  // ========================
  // Inventory Routes
  // ========================
  const { registerInventoryRoutes } = await import("./routes/inventory");
  registerInventoryRoutes(app);

  // ========================
  // Receiving Routes
  // ========================
  const { registerReceivingRoutes } = await import("./routes/receiving");
  registerReceivingRoutes(app);

  // ========================
  // Reorder Flags Routes
  // ========================
  const { registerReorderFlagsRoutes } = await import("./routes/reorder-flags");
  registerReorderFlagsRoutes(app);

  // ========================
  // Orders Routes
  // ========================
  const { registerOrderRoutes } = await import("./routes/orders");
  registerOrderRoutes(app);

  // ========================
  // Integrations Routes
  // ========================
  const { registerIntegrationRoutes } = await import("./routes/integrations");
  registerIntegrationRoutes(app);

  return httpServer;
}

// Seed initial data for development/testing
async function seedInitialData() {
  try {
    // Check if users exist
    const existingUsers = await storage.getAllUsers();
    
    if (existingUsers.length === 0) {
      // Create superadmin user with userId 060385 and PIN 3362
      await storage.createUser({
        userId: "060385",
        name: "Superadmin",
        pinCode: hashPin("3362"),
        role: "owner",
      });
      
      // Create additional test users (optional)
      const adminPin = Math.floor(1000 + Math.random() * 9000).toString();
      const staffPin = Math.floor(1000 + Math.random() * 9000).toString();
      
      await storage.createUser({
        userId: Math.floor(100000 + Math.random() * 900000).toString().padStart(6, "0"),
        name: "Admin",
        pinCode: hashPin(adminPin),
        role: "admin",
      });
      
      await storage.createUser({
        userId: Math.floor(100000 + Math.random() * 900000).toString().padStart(6, "0"),
        name: "Staff",
        pinCode: hashPin(staffPin),
        role: "staff",
      });
      
      // Log PINs only in development, warn in production
      if (process.env.NODE_ENV === "development") {
        console.log(`Seeded default users - Superadmin (User ID: 060385, PIN: 3362), Admin (PIN: ${adminPin}), Staff (PIN: ${staffPin})`);
        console.log("⚠️  WARNING: Change these credentials immediately in production!");
      } else {
        console.log("Seeded default users. Credentials have been generated and hashed.");
        console.log("⚠️  WARNING: Default users created. Change credentials immediately!");
      }
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
