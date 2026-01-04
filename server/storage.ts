import { 
  users, settings, distributors, products, kegs, taps,
  type User, type InsertUser,
  type Settings, type InsertSettings,
  type Distributor, type InsertDistributor,
  type Product, type InsertProduct,
  type Keg, type InsertKeg,
  type Tap, type InsertTap
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByPin(pinCode: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // Settings
  getSettings(): Promise<Settings | undefined>;
  createSettings(settings: InsertSettings): Promise<Settings>;
  updateSettings(id: number, settings: Partial<InsertSettings>): Promise<Settings | undefined>;
  
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
  getAllKegs(): Promise<Keg[]>;
  getKegsByStatus(status: "on_deck" | "tapped" | "kicked"): Promise<Keg[]>;
  createKeg(keg: InsertKeg): Promise<Keg>;
  updateKeg(id: number, keg: Partial<InsertKeg>): Promise<Keg | undefined>;
  
  // Taps
  getTap(tapNumber: number): Promise<Tap | undefined>;
  getAllTaps(): Promise<Tap[]>;
  createTap(tap: InsertTap): Promise<Tap>;
  updateTap(tapNumber: number, tap: Partial<InsertTap>): Promise<Tap | undefined>;
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

  async updateSettings(id: number, updateData: Partial<InsertSettings>): Promise<Settings | undefined> {
    const [result] = await db.update(settings).set(updateData).where(eq(settings.id, id)).returning();
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

  async getAllKegs(): Promise<Keg[]> {
    return db.select().from(kegs);
  }

  async getKegsByStatus(status: "on_deck" | "tapped" | "kicked"): Promise<Keg[]> {
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
}

export const storage = new DatabaseStorage();
