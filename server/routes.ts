import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { pinLoginSchema } from "@shared/schema";
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
