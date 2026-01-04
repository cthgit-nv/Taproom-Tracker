import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, real, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==========================================
// TABLE DEFINITIONS (All tables first)
// ==========================================

// Users table - staff and admin authentication via PIN
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  pinCode: varchar("pin_code", { length: 4 }).notNull().unique(),
  role: text("role", { enum: ["admin", "staff"] }).notNull().default("staff"),
});

// Settings table - system configuration
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  pmbLocalIp: text("pmb_local_ip"),
  pmbLocalPort: integer("pmb_local_port"),
  simulationMode: boolean("simulation_mode").notNull().default(true),
  pluRangeStart: integer("plu_range_start").notNull().default(1000),
  pluRangeEnd: integer("plu_range_end").notNull().default(2000),
});

// Distributors table
export const distributors = pgTable("distributors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email"),
  orderMinimum: decimal("order_minimum", { precision: 10, scale: 2 }),
});

// Products table - inventory items
export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  upc: text("upc").unique(),
  distributorId: integer("distributor_id").references(() => distributors.id),
  plu: integer("plu").unique(),
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }),
  pricePerUnit: decimal("price_per_unit", { precision: 10, scale: 2 }),
  isSoldByVolume: boolean("is_sold_by_volume").default(false),
  bottleSizeMl: integer("bottle_size_ml"),
  untappdId: integer("untappd_id"),
  untappdContainerId: text("untappd_container_id"),
  abv: real("abv"),
  ibu: integer("ibu"),
  style: text("style"),
  description: text("description"),
  labelImageUrl: text("label_image_url"),
  isLocal: boolean("is_local").default(false),
  flavorTags: text("flavor_tags").array(),
  currentCount: real("current_count").default(0),
  parLevel: integer("par_level"),
  historicalVelocity: real("historical_velocity"),
});

// Kegs table - individual keg tracking
export const kegs = pgTable("kegs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  productId: integer("product_id").references(() => products.id).notNull(),
  status: text("status", { enum: ["on_deck", "tapped", "kicked"] }).notNull().default("on_deck"),
  initialVolOz: real("initial_vol_oz"),
  remainingVolOz: real("remaining_vol_oz"),
  dateReceived: timestamp("date_received"),
  dateTapped: timestamp("date_tapped"),
  dateKicked: timestamp("date_kicked"),
});

// Taps table - physical tap assignments
export const taps = pgTable("taps", {
  tapNumber: integer("tap_number").primaryKey(),
  currentKegId: integer("current_keg_id").references(() => kegs.id),
  pmbTapId: text("pmb_tap_id"),
});

// ==========================================
// RELATIONS (All relations after tables)
// ==========================================

export const usersRelations = relations(users, ({ }) => ({
  // Future: audit logs, etc.
}));

export const distributorsRelations = relations(distributors, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  distributor: one(distributors, {
    fields: [products.distributorId],
    references: [distributors.id],
  }),
  kegs: many(kegs),
}));

export const kegsRelations = relations(kegs, ({ one }) => ({
  product: one(products, {
    fields: [kegs.productId],
    references: [products.id],
  }),
  tap: one(taps, {
    fields: [kegs.id],
    references: [taps.currentKegId],
  }),
}));

export const tapsRelations = relations(taps, ({ one }) => ({
  currentKeg: one(kegs, {
    fields: [taps.currentKegId],
    references: [kegs.id],
  }),
}));

// ==========================================
// INSERT SCHEMAS
// ==========================================

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export const insertDistributorSchema = createInsertSchema(distributors).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertKegSchema = createInsertSchema(kegs).omit({ id: true });
export const insertTapSchema = createInsertSchema(taps);

// ==========================================
// TYPES
// ==========================================

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export type InsertDistributor = z.infer<typeof insertDistributorSchema>;
export type Distributor = typeof distributors.$inferSelect;

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export type InsertKeg = z.infer<typeof insertKegSchema>;
export type Keg = typeof kegs.$inferSelect;

export type InsertTap = z.infer<typeof insertTapSchema>;
export type Tap = typeof taps.$inferSelect;

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

export const pinLoginSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export type PinLogin = z.infer<typeof pinLoginSchema>;
