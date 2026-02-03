import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { hashPin, verifyPin, sanitizeInput } from "../security";
import { requireAuth, requireOwner, asyncHandler } from "../middleware";

/**
 * Register user management routes (owner only)
 */
export function registerUserRoutes(app: Express): void {
  // Get all users - requires authentication
  app.get("/api/users", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    const users = await storage.getAllUsers();
    // Remove PIN from response
    const safeUsers = users.map(({ pinCode, ...user }) => user);
    return res.json(safeUsers);
  }));

  // Create new user (owner only)
  app.post("/api/users", requireAuth, requireOwner, asyncHandler(async (req: Request, res: Response) => {
    const { userId, name, pinCode, role } = req.body;
    
    if (!userId || !name || !pinCode || !role) {
      return res.status(400).json({ error: "User ID, name, PIN, and role are required" });
    }
    
    if (!["owner", "admin", "staff"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    
    // Validate userId format (MMDDYY - 6 digits)
    if (!/^\d{6}$/.test(userId)) {
      return res.status(400).json({ error: "User ID must be exactly 6 digits (MMDDYY format)" });
    }
    
    // Validate PIN format
    if (!/^\d{4}$/.test(pinCode)) {
      return res.status(400).json({ error: "PIN must be exactly 4 digits" });
    }
    
    // Sanitize name
    const sanitizedName = sanitizeInput(name);
    if (!sanitizedName || sanitizedName.length < 1) {
      return res.status(400).json({ error: "Invalid name" });
    }
    
    // Check if userId already exists
    const existingUserById = await storage.getUserByUserId(userId);
    if (existingUserById) {
      return res.status(400).json({ error: "User ID already in use" });
    }
    
    // Check if PIN already exists (check all users for hash match)
    const allUsers = await storage.getAllUsers();
    const existingUserByPin = allUsers.find(u => {
      try {
        return verifyPin(pinCode, u.pinCode) || u.pinCode === pinCode;
      } catch {
        return u.pinCode === pinCode;
      }
    });
    if (existingUserByPin) {
      return res.status(400).json({ error: "PIN already in use" });
    }
    
    // Hash PIN before storing
    const hashedPin = hashPin(pinCode);
    const user = await storage.createUser({ userId, name: sanitizedName, pinCode: hashedPin, role });
    const { pinCode: _, ...safeUser } = user;
    return res.json(safeUser);
  }));
  
  // Update user (owner only)
  app.patch("/api/users/:id", requireAuth, requireOwner, asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    
    const { userId: newUserId, name, pinCode, role } = req.body;
    
    const updateData: any = {};
    
    if (newUserId !== undefined) {
      // Validate userId format (MMDDYY - 6 digits)
      if (!/^\d{6}$/.test(newUserId)) {
        return res.status(400).json({ error: "User ID must be exactly 6 digits (MMDDYY format)" });
      }
      
      // Check if userId already exists (for another user)
      const existingUserById = await storage.getUserByUserId(newUserId);
      if (existingUserById && existingUserById.id !== userId) {
        return res.status(400).json({ error: "User ID already in use" });
      }
      
      updateData.userId = newUserId;
    }
    
    if (name !== undefined) {
      const sanitizedName = sanitizeInput(name);
      if (!sanitizedName || sanitizedName.length < 1) {
        return res.status(400).json({ error: "Invalid name" });
      }
      updateData.name = sanitizedName;
    }
    
    if (pinCode !== undefined) {
      // Validate PIN format
      if (!/^\d{4}$/.test(pinCode)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }
      
      // Check if PIN already exists (check all users for hash match)
      const allUsers = await storage.getAllUsers();
      const existingUserByPin = allUsers.find(u => {
        try {
          return (verifyPin(pinCode, u.pinCode) || u.pinCode === pinCode) && u.id !== userId;
        } catch {
          return u.pinCode === pinCode && u.id !== userId;
        }
      });
      if (existingUserByPin) {
        return res.status(400).json({ error: "PIN already in use" });
      }
      
      // Hash PIN before storing
      updateData.pinCode = hashPin(pinCode);
    }
    
    if (role !== undefined) {
      if (!["owner", "admin", "staff"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      updateData.role = role;
    }
    
    const user = await storage.updateUser(userId, updateData);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const { pinCode: _, ...safeUser } = user;
    return res.json(safeUser);
  }));
  
  // Delete user (owner only, cannot delete self)
  app.delete("/api/users/:id", requireAuth, requireOwner, asyncHandler(async (req: Request, res: Response) => {
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
  }));
}
