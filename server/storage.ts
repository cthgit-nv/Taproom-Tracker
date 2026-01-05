import { 
  users, settings, distributors, products, kegs, taps, zones, inventorySessions, inventoryCounts, receivingLogs,
  reorderFlags, orders, orderItems,
  type User, type InsertUser,
  type Settings, type InsertSettings,
  type Distributor, type InsertDistributor,
  type Product, type InsertProduct,
  type Keg, type InsertKeg,
  type Tap, type InsertTap,
  type Zone, type InsertZone,
  type InventorySession, type InsertInventorySession,
  type InventoryCount, type InsertInventoryCount,
  type ReceivingLog, type InsertReceivingLog,
  type ReorderFlag, type InsertReorderFlag,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByPin(pinCode: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;
  
  // Settings
  getSettings(): Promise<Settings | undefined>;
  createSettings(settings: InsertSettings): Promise<Settings>;
  updateSettings(settings: Partial<InsertSettings>): Promise<Settings | undefined>;
  
  // Distributors
  getDistributor(id: number): Promise<Distributor | undefined>;
  getAllDistributors(): Promise<Distributor[]>;
  createDistributor(distributor: InsertDistributor): Promise<Distributor>;
  
  // Products
  getProduct(id: number): Promise<Product | undefined>;
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  
  // Kegs
  getKeg(id: number): Promise<Keg | undefined>;
  getAllKegs(isSimulation?: boolean): Promise<Keg[]>;
  getKegsByStatus(status: "on_deck" | "tapped" | "kicked", isSimulation?: boolean): Promise<Keg[]>;
  createKeg(keg: InsertKeg): Promise<Keg>;
  updateKeg(id: number, keg: Partial<InsertKeg>): Promise<Keg | undefined>;
  
  // Taps
  getTap(tapNumber: number): Promise<Tap | undefined>;
  getAllTaps(): Promise<Tap[]>;
  createTap(tap: InsertTap): Promise<Tap>;
  updateTap(tapNumber: number, tap: Partial<InsertTap>): Promise<Tap | undefined>;
  
  // Zones
  getZone(id: number): Promise<Zone | undefined>;
  getAllZones(): Promise<Zone[]>;
  createZone(zone: InsertZone): Promise<Zone>;
  
  // Inventory Sessions
  getInventorySession(id: number): Promise<InventorySession | undefined>;
  getActiveSession(userId: number, isSimulation?: boolean): Promise<InventorySession | undefined>;
  getAllInventorySessions(isSimulation?: boolean): Promise<InventorySession[]>;
  createInventorySession(session: InsertInventorySession): Promise<InventorySession>;
  updateInventorySession(id: number, session: Partial<InsertInventorySession>): Promise<InventorySession | undefined>;
  
  // Inventory Counts
  getInventoryCount(id: number): Promise<InventoryCount | undefined>;
  getCountsBySession(sessionId: number): Promise<InventoryCount[]>;
  createInventoryCount(count: InsertInventoryCount): Promise<InventoryCount>;
  updateInventoryCount(id: number, count: Partial<InsertInventoryCount>): Promise<InventoryCount | undefined>;
  
  // Receiving Logs
  createReceivingLog(log: InsertReceivingLog): Promise<ReceivingLog>;
  getReceivingLogs(isSimulation?: boolean): Promise<ReceivingLog[]>;
  
  // Product lookup
  getProductByUpc(upc: string): Promise<Product | undefined>;
  
  // Reorder Flags
  createReorderFlag(flag: InsertReorderFlag): Promise<ReorderFlag>;
  getActiveReorderFlags(): Promise<ReorderFlag[]>;
  getReorderFlag(id: number): Promise<ReorderFlag | undefined>;
  resolveReorderFlag(id: number, orderId?: number): Promise<ReorderFlag | undefined>;
  
  // Orders
  createOrder(order: InsertOrder): Promise<Order>;
  getOrder(id: number): Promise<Order | undefined>;
  getAllOrders(status?: string): Promise<Order[]>;
  getOrdersByDistributor(distributorId: number): Promise<Order[]>;
  updateOrder(id: number, order: Partial<InsertOrder>): Promise<Order | undefined>;
  
  // Order Items
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  getOrderItems(orderId: number): Promise<OrderItem[]>;
  updateOrderItem(id: number, item: Partial<InsertOrderItem>): Promise<OrderItem | undefined>;
  deleteOrderItem(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByPin(pinCode: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.pinCode, pinCode));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const [result] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return result || undefined;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  // Settings
  async getSettings(): Promise<Settings | undefined> {
    const [result] = await db.select().from(settings).limit(1);
    return result || undefined;
  }

  async createSettings(insertSettings: InsertSettings): Promise<Settings> {
    const [result] = await db.insert(settings).values(insertSettings).returning();
    return result;
  }

  async updateSettings(updateData: Partial<InsertSettings>): Promise<Settings | undefined> {
    // Get the first settings row and update it
    const existingSettings = await this.getSettings();
    if (!existingSettings) return undefined;
    const [result] = await db.update(settings).set(updateData).where(eq(settings.id, existingSettings.id)).returning();
    return result || undefined;
  }

  // Distributors
  async getDistributor(id: number): Promise<Distributor | undefined> {
    const [result] = await db.select().from(distributors).where(eq(distributors.id, id));
    return result || undefined;
  }

  async getAllDistributors(): Promise<Distributor[]> {
    return db.select().from(distributors);
  }

  async createDistributor(insertDistributor: InsertDistributor): Promise<Distributor> {
    const [result] = await db.insert(distributors).values(insertDistributor).returning();
    return result;
  }

  // Products
  async getProduct(id: number): Promise<Product | undefined> {
    const [result] = await db.select().from(products).where(eq(products.id, id));
    return result || undefined;
  }

  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [result] = await db.insert(products).values(insertProduct).returning();
    return result;
  }

  async updateProduct(id: number, updateData: Partial<InsertProduct>): Promise<Product | undefined> {
    const [result] = await db.update(products).set(updateData).where(eq(products.id, id)).returning();
    return result || undefined;
  }

  // Kegs
  async getKeg(id: number): Promise<Keg | undefined> {
    const [result] = await db.select().from(kegs).where(eq(kegs.id, id));
    return result || undefined;
  }

  async getAllKegs(isSimulation?: boolean): Promise<Keg[]> {
    if (isSimulation !== undefined) {
      return db.select().from(kegs).where(eq(kegs.isSimulation, isSimulation));
    }
    return db.select().from(kegs);
  }

  async getKegsByStatus(status: "on_deck" | "tapped" | "kicked", isSimulation?: boolean): Promise<Keg[]> {
    if (isSimulation !== undefined) {
      return db.select().from(kegs).where(and(eq(kegs.status, status), eq(kegs.isSimulation, isSimulation)));
    }
    return db.select().from(kegs).where(eq(kegs.status, status));
  }

  async createKeg(insertKeg: InsertKeg): Promise<Keg> {
    const [result] = await db.insert(kegs).values(insertKeg).returning();
    return result;
  }

  async updateKeg(id: number, updateData: Partial<InsertKeg>): Promise<Keg | undefined> {
    const [result] = await db.update(kegs).set(updateData).where(eq(kegs.id, id)).returning();
    return result || undefined;
  }

  // Taps
  async getTap(tapNumber: number): Promise<Tap | undefined> {
    const [result] = await db.select().from(taps).where(eq(taps.tapNumber, tapNumber));
    return result || undefined;
  }

  async getAllTaps(): Promise<Tap[]> {
    return db.select().from(taps);
  }

  async createTap(insertTap: InsertTap): Promise<Tap> {
    const [result] = await db.insert(taps).values(insertTap).returning();
    return result;
  }

  async updateTap(tapNumber: number, updateData: Partial<InsertTap>): Promise<Tap | undefined> {
    const [result] = await db.update(taps).set(updateData).where(eq(taps.tapNumber, tapNumber)).returning();
    return result || undefined;
  }

  // Zones
  async getZone(id: number): Promise<Zone | undefined> {
    const [result] = await db.select().from(zones).where(eq(zones.id, id));
    return result || undefined;
  }

  async getAllZones(): Promise<Zone[]> {
    return db.select().from(zones);
  }

  async createZone(insertZone: InsertZone): Promise<Zone> {
    const [result] = await db.insert(zones).values(insertZone).returning();
    return result;
  }

  // Inventory Sessions
  async getInventorySession(id: number): Promise<InventorySession | undefined> {
    const [result] = await db.select().from(inventorySessions).where(eq(inventorySessions.id, id));
    return result || undefined;
  }

  async getActiveSession(userId: number, isSimulation?: boolean): Promise<InventorySession | undefined> {
    if (isSimulation !== undefined) {
      const [result] = await db.select().from(inventorySessions)
        .where(and(
          eq(inventorySessions.userId, userId), 
          eq(inventorySessions.status, "in_progress"),
          eq(inventorySessions.isSimulation, isSimulation)
        ));
      return result || undefined;
    }
    const [result] = await db.select().from(inventorySessions)
      .where(and(eq(inventorySessions.userId, userId), eq(inventorySessions.status, "in_progress")));
    return result || undefined;
  }

  async getAllInventorySessions(isSimulation?: boolean): Promise<InventorySession[]> {
    if (isSimulation !== undefined) {
      return db.select().from(inventorySessions).where(eq(inventorySessions.isSimulation, isSimulation));
    }
    return db.select().from(inventorySessions);
  }

  async createInventorySession(insertSession: InsertInventorySession): Promise<InventorySession> {
    const [result] = await db.insert(inventorySessions).values(insertSession).returning();
    return result;
  }

  async updateInventorySession(id: number, updateData: Partial<InsertInventorySession>): Promise<InventorySession | undefined> {
    const [result] = await db.update(inventorySessions).set(updateData).where(eq(inventorySessions.id, id)).returning();
    return result || undefined;
  }

  // Inventory Counts
  async getInventoryCount(id: number): Promise<InventoryCount | undefined> {
    const [result] = await db.select().from(inventoryCounts).where(eq(inventoryCounts.id, id));
    return result || undefined;
  }

  async getCountsBySession(sessionId: number): Promise<InventoryCount[]> {
    return db.select().from(inventoryCounts).where(eq(inventoryCounts.sessionId, sessionId));
  }

  async createInventoryCount(insertCount: InsertInventoryCount): Promise<InventoryCount> {
    const [result] = await db.insert(inventoryCounts).values(insertCount).returning();
    return result;
  }

  async updateInventoryCount(id: number, updateData: Partial<InsertInventoryCount>): Promise<InventoryCount | undefined> {
    const [result] = await db.update(inventoryCounts).set(updateData).where(eq(inventoryCounts.id, id)).returning();
    return result || undefined;
  }

  // Receiving Logs
  async createReceivingLog(insertLog: InsertReceivingLog): Promise<ReceivingLog> {
    const [result] = await db.insert(receivingLogs).values(insertLog).returning();
    return result;
  }

  async getReceivingLogs(isSimulation?: boolean): Promise<ReceivingLog[]> {
    if (isSimulation !== undefined) {
      return db.select().from(receivingLogs).where(eq(receivingLogs.isSimulation, isSimulation));
    }
    return db.select().from(receivingLogs);
  }

  // Product lookup
  async getProductByUpc(upc: string): Promise<Product | undefined> {
    const [result] = await db.select().from(products).where(eq(products.upc, upc));
    return result || undefined;
  }

  // Reorder Flags
  async createReorderFlag(insertFlag: InsertReorderFlag): Promise<ReorderFlag> {
    const [result] = await db.insert(reorderFlags).values(insertFlag).returning();
    return result;
  }

  async getActiveReorderFlags(): Promise<ReorderFlag[]> {
    return db.select().from(reorderFlags).where(isNull(reorderFlags.resolvedAt)).orderBy(desc(reorderFlags.createdAt));
  }

  async getReorderFlag(id: number): Promise<ReorderFlag | undefined> {
    const [result] = await db.select().from(reorderFlags).where(eq(reorderFlags.id, id));
    return result || undefined;
  }

  async resolveReorderFlag(id: number, orderId?: number): Promise<ReorderFlag | undefined> {
    const updateData: Partial<ReorderFlag> = { resolvedAt: new Date() };
    if (orderId) updateData.orderId = orderId;
    const [result] = await db.update(reorderFlags).set(updateData).where(eq(reorderFlags.id, id)).returning();
    return result || undefined;
  }

  // Orders
  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [result] = await db.insert(orders).values(insertOrder).returning();
    return result;
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [result] = await db.select().from(orders).where(eq(orders.id, id));
    return result || undefined;
  }

  async getAllOrders(status?: string): Promise<Order[]> {
    if (status) {
      return db.select().from(orders).where(eq(orders.status, status as any)).orderBy(desc(orders.createdAt));
    }
    return db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getOrdersByDistributor(distributorId: number): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.distributorId, distributorId)).orderBy(desc(orders.createdAt));
  }

  async updateOrder(id: number, updateData: Partial<InsertOrder>): Promise<Order | undefined> {
    const [result] = await db.update(orders).set(updateData).where(eq(orders.id, id)).returning();
    return result || undefined;
  }

  // Order Items
  async createOrderItem(insertItem: InsertOrderItem): Promise<OrderItem> {
    const [result] = await db.insert(orderItems).values(insertItem).returning();
    return result;
  }

  async getOrderItems(orderId: number): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async updateOrderItem(id: number, updateData: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
    const [result] = await db.update(orderItems).set(updateData).where(eq(orderItems.id, id)).returning();
    return result || undefined;
  }

  async deleteOrderItem(id: number): Promise<void> {
    await db.delete(orderItems).where(eq(orderItems.id, id));
  }
}

export const storage = new DatabaseStorage();
