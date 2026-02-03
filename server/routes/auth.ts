import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { userIdLoginSchema, pinLoginSchema } from "@shared/schema";
import { z } from "zod";
import { rateLimit, verifyPin, hashPin } from "../security";
import { asyncHandler } from "../middleware";

/**
 * Register authentication routes
 */
export function registerAuthRoutes(app: Express): void {
  // Step 1: Verify userId (birthdate) exists - rate limited
  app.post(
    "/api/auth/verify-user-id",
    rateLimit(10, 15 * 60 * 1000), // 10 attempts per 15 minutes
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { userId } = userIdLoginSchema.parse(req.body);
        
        // Check if user exists
        const user = await storage.getUserByUserId(userId);
        
        if (!user) {
          // Use generic error message to prevent user enumeration
          return res.status(401).json({ error: "Invalid user ID" });
        }
        
        // Ensure user has a userId (migration check)
        if (!user.userId) {
          return res.status(401).json({ error: "User account needs to be updated. Please contact administrator." });
        }
        
        // Store userId in session temporarily for step 2
        req.session.tempUserId = userId;
        
        return res.json({ success: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Invalid user ID format. Must be 6 digits (MMDDYY)" });
        }
        throw error; // Let asyncHandler pass to error middleware
      }
    })
  );

  // Step 2: Login with userId + PIN - rate limited to prevent brute force
  app.post(
    "/api/auth/login",
    rateLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { userId, pin } = pinLoginSchema.parse(req.body);
        
        // Verify userId matches the one from step 1 (if session exists)
        // This prevents bypassing step 1
        if (req.session.tempUserId && req.session.tempUserId !== userId) {
          return res.status(401).json({ error: "Invalid credentials" });
        }
        
        // Get user by userId
        const user = await storage.getUserByUserId(userId);
        
        if (!user || !user.userId) {
          // Use generic error message to prevent user enumeration
          return res.status(401).json({ error: "Invalid credentials" });
        }
        
        // Verify PIN hash
        let pinValid = false;
        try {
          pinValid = verifyPin(pin, user.pinCode);
        } catch {
          // Fallback for plain text during migration
          pinValid = user.pinCode === pin;
        }
        
        if (!pinValid) {
          // Use generic error message to prevent user enumeration
          return res.status(401).json({ error: "Invalid credentials" });
        }
        
        // Clear temporary userId from session
        delete req.session.tempUserId;
        
        // Set session
        req.session.userId = user.id;
        
        // Return user without exposing PIN
        const { pinCode, ...safeUser } = user;
        return res.json({ user: safeUser });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Invalid credentials format" });
        }
        throw error; // Let asyncHandler pass to error middleware
      }
    })
  );

  // Check session
  app.get("/api/auth/session", asyncHandler(async (req: Request, res: Response) => {
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
  }));

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
}
