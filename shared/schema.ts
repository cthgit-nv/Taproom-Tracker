import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, real, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==========================================
// TABLE DEFINITIONS (All tables first)
// ==========================================

// Users table - staff, admin, and owner authentication via userId (birthdate) + PIN
// Roles: owner (super admin), admin (GM), staff (regular operations)
// userId: birthdate in MMDDYY format (e.g., 060385 for June 3, 1985)
// Note: userId is nullable to support migration from old schema
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id", { length: 6 }).unique(), // Birthdate MMDDYY format (nullable for migration)
  name: text("name").notNull(),
  pinCode: varchar("pin_code", { length: 64 }).notNull(), // Hashed PIN (SHA-256 produces 64 char hex)
  role: text("role", { enum: ["owner", "admin", "staff"] }).notNull().default("staff"),
});

// Settings table - system configuration
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  pmbLocalIp: text("pmb_local_ip"),
  pmbLocalPort: integer("pmb_local_port"),
  pmbUsername: text("pmb_username"),
  pmbPassword: text("pmb_password"),
  simulationMode: boolean("simulation_mode").notNull().default(true),
  pluRangeStart: integer("plu_range_start").notNull().default(1000),
  pluRangeEnd: integer("plu_range_end").notNull().default(2000),
  gotabLocId: text("gotab_loc_id"),
  gotabKey: text("gotab_key"),
  gotabSecret: text("gotab_secret"),
  untappdReadToken: text("untappd_read_token"),
  untappdWriteToken: text("untappd_write_token"),
  untappdMenuId: text("untappd_menu_id"),
  // Smart Order score formula coefficients (admin editable)
  scoreVelocityWeight: real("score_velocity_weight").notNull().default(0.4),
  scoreRatingWeight: real("score_rating_weight").notNull().default(0.3),
  scoreLocalWeight: real("score_local_weight").notNull().default(0.2),
  scoreProfitWeight: real("score_profit_weight").notNull().default(0.1),
});

// Pricing mode enum - determines how a product is sold
// draft_per_oz: kegs poured by the ounce
// package_unit: cans/bottles sold as-is (fixed size)
// bottle_pour: wine bottles sold by bottle OR by glass
// spirit_pour: spirits sold by shot
export const pricingModeEnum = ["draft_per_oz", "package_unit", "bottle_pour", "spirit_pour"] as const;
export type PricingMode = typeof pricingModeEnum[number];

// Distributors table
export const distributors = pgTable("distributors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email"),
  orderMinimum: decimal("order_minimum", { precision: 10, scale: 2 }),
});

// Beverage type enum for filtering
// spirits = hard alcohol (whiskey, vodka, gin, rum, etc.)
// na = non-alcoholic (Athletic, Heineken 0.0, etc.)
// kombucha = fermented tea on tap
export const beverageTypeEnum = ["beer", "cider", "wine", "spirits", "na", "kombucha"] as const;
export type BeverageType = typeof beverageTypeEnum[number];

// Pricing Defaults table - admin-configurable target margins by beverage type
export const pricingDefaults = pgTable("pricing_defaults", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  beverageType: text("beverage_type", { enum: beverageTypeEnum }).notNull(),
  pricingMode: text("pricing_mode", { enum: pricingModeEnum }).notNull(),
  targetPourCost: real("target_pour_cost").notNull().default(0.22),
  defaultServingSizeOz: real("default_serving_size_oz"),
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
  pricingMode: text("pricing_mode", { enum: pricingModeEnum }),
  servingSizeOz: real("serving_size_oz"),
  targetPourCost: real("target_pour_cost"),
  isSoldByVolume: boolean("is_sold_by_volume").default(false),
  bottleSizeMl: integer("bottle_size_ml"),
  emptyWeightGrams: integer("empty_weight_grams"),
  fullWeightGrams: integer("full_weight_grams"),
  untappdId: integer("untappd_id"),
  untappdContainerId: text("untappd_container_id"),
  abv: real("abv"),
  ibu: integer("ibu"),
  style: text("style"),
  description: text("description"),
  labelImageUrl: text("label_image_url"),
  isLocal: boolean("is_local").default(false),
  flavorTags: text("flavor_tags").array(),
  currentCountBottles: real("current_count_bottles").default(0),
  parLevel: integer("par_level"),
  historicalVelocity: real("historical_velocity"),
  backupCount: integer("backup_count").default(0),
  untappdRating: real("untappd_rating"),
  untappdRatingCount: integer("untappd_rating_count"),
  brand: text("brand"),
  beverageType: text("beverage_type", { enum: beverageTypeEnum }).default("beer"),
  notes: text("notes"),
});

// Kegs table - individual keg tracking
// Status: on_deck = Back Inventory (full kegs waiting), tapped = linked to PMB/tap, kicked = empty
// isSimulation: separates training data from production inventory
// pricePerOz and targetPourCost can override product defaults when tapped
export const kegs = pgTable("kegs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  productId: integer("product_id").references(() => products.id).notNull(),
  status: text("status", { enum: ["on_deck", "tapped", "kicked"] }).notNull().default("on_deck"),
  tapNumber: integer("tap_number"),
  initialVolOz: real("initial_vol_oz"),
  remainingVolOz: real("remaining_vol_oz"),
  dateReceived: timestamp("date_received"),
  dateTapped: timestamp("date_tapped"),
  dateKicked: timestamp("date_kicked"),
  isSimulation: boolean("is_simulation").notNull().default(false),
  pricePerOz: decimal("price_per_oz", { precision: 10, scale: 4 }),
  costPerOz: decimal("cost_per_oz", { precision: 10, scale: 4 }),
  targetPourCost: real("target_pour_cost"),
});

// Taps table - physical tap assignments
export const taps = pgTable("taps", {
  tapNumber: integer("tap_number").primaryKey(),
  currentKegId: integer("current_keg_id").references(() => kegs.id),
  pmbTapId: text("pmb_tap_id"),
});

// Zones table - inventory areas (e.g., "Front Bar", "Back Bar", "Storage")
export const zones = pgTable("zones", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  description: text("description"),
});

// Inventory Sessions table - tracks counting sessions
// isSimulation: separates training data from production inventory
export const inventorySessions = pgTable("inventory_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  zoneId: integer("zone_id").references(() => zones.id).notNull(),
  status: text("status", { enum: ["in_progress", "completed", "cancelled"] }).notNull().default("in_progress"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  isSimulation: boolean("is_simulation").notNull().default(false),
});

// Inventory Counts table - individual product counts within a session
export const inventoryCounts = pgTable("inventory_counts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sessionId: integer("session_id").references(() => inventorySessions.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  expectedCount: real("expected_count"),
  countedBottles: real("counted_bottles").notNull().default(0),
  countedPartialOz: real("counted_partial_oz"),
  isManualEstimate: boolean("is_manual_estimate").default(true),
  scaleWeightGrams: integer("scale_weight_grams"),
  countedAt: timestamp("counted_at").notNull().defaultNow(),
});

// Receiving Log table - tracks incoming shipments
// isSimulation: separates training data from production inventory
export const receivingLogs = pgTable("receiving_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: real("quantity").notNull(),
  isKeg: boolean("is_keg").notNull().default(false),
  zoneId: integer("zone_id").references(() => zones.id),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  isSimulation: boolean("is_simulation").notNull().default(false),
});

// Order status enum
export const orderStatusEnum = ["draft", "submitted", "confirmed", "partially_received", "received", "cancelled"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

// Unit type for order items
export const unitTypeEnum = ["keg", "case", "each"] as const;
export type UnitType = typeof unitTypeEnum[number];

// Reorder Flags table - staff can flag products that need reordering
export const reorderFlags = pgTable("reorder_flags", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  productId: integer("product_id").references(() => products.id).notNull(),
  kegId: integer("keg_id").references(() => kegs.id),
  flaggedById: integer("flagged_by_id").references(() => users.id).notNull(),
  reason: text("reason"),
  suggestedQuantity: integer("suggested_quantity").default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  orderId: integer("order_id"),
});

// Orders table - purchase orders grouped by distributor
export const orders = pgTable("orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  distributorId: integer("distributor_id").references(() => distributors.id).notNull(),
  status: text("status", { enum: orderStatusEnum }).notNull().default("draft"),
  createdById: integer("created_by_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  receivedAt: timestamp("received_at"),
  notes: text("notes"),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),
});

// Order Items table - line items within an order
export const orderItems = pgTable("order_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitType: text("unit_type", { enum: unitTypeEnum }).notNull().default("keg"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  note: text("note"),
  sourceFlagId: integer("source_flag_id").references(() => reorderFlags.id),
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

export const zonesRelations = relations(zones, ({ many }) => ({
  sessions: many(inventorySessions),
}));

export const inventorySessionsRelations = relations(inventorySessions, ({ one, many }) => ({
  user: one(users, {
    fields: [inventorySessions.userId],
    references: [users.id],
  }),
  zone: one(zones, {
    fields: [inventorySessions.zoneId],
    references: [zones.id],
  }),
  counts: many(inventoryCounts),
}));

export const inventoryCountsRelations = relations(inventoryCounts, ({ one }) => ({
  session: one(inventorySessions, {
    fields: [inventoryCounts.sessionId],
    references: [inventorySessions.id],
  }),
  product: one(products, {
    fields: [inventoryCounts.productId],
    references: [products.id],
  }),
}));

export const receivingLogsRelations = relations(receivingLogs, ({ one }) => ({
  user: one(users, {
    fields: [receivingLogs.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [receivingLogs.productId],
    references: [products.id],
  }),
}));

export const reorderFlagsRelations = relations(reorderFlags, ({ one }) => ({
  product: one(products, {
    fields: [reorderFlags.productId],
    references: [products.id],
  }),
  keg: one(kegs, {
    fields: [reorderFlags.kegId],
    references: [kegs.id],
  }),
  flaggedBy: one(users, {
    fields: [reorderFlags.flaggedById],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [reorderFlags.orderId],
    references: [orders.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  distributor: one(distributors, {
    fields: [orders.distributorId],
    references: [distributors.id],
  }),
  createdBy: one(users, {
    fields: [orders.createdById],
    references: [users.id],
  }),
  items: many(orderItems),
  flags: many(reorderFlags),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  sourceFlag: one(reorderFlags, {
    fields: [orderItems.sourceFlagId],
    references: [reorderFlags.id],
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
export const insertZoneSchema = createInsertSchema(zones).omit({ id: true });
export const insertInventorySessionSchema = createInsertSchema(inventorySessions).omit({ id: true, startedAt: true });
export const insertInventoryCountSchema = createInsertSchema(inventoryCounts).omit({ id: true, countedAt: true });
export const insertReceivingLogSchema = createInsertSchema(receivingLogs).omit({ id: true, receivedAt: true });
export const insertReorderFlagSchema = createInsertSchema(reorderFlags).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertPricingDefaultSchema = createInsertSchema(pricingDefaults).omit({ id: true });

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

export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;

export type InsertInventorySession = z.infer<typeof insertInventorySessionSchema>;
export type InventorySession = typeof inventorySessions.$inferSelect;

export type InsertInventoryCount = z.infer<typeof insertInventoryCountSchema>;
export type InventoryCount = typeof inventoryCounts.$inferSelect;

export type InsertReceivingLog = z.infer<typeof insertReceivingLogSchema>;
export type ReceivingLog = typeof receivingLogs.$inferSelect;

export type InsertReorderFlag = z.infer<typeof insertReorderFlagSchema>;
export type ReorderFlag = typeof reorderFlags.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export type InsertPricingDefault = z.infer<typeof insertPricingDefaultSchema>;
export type PricingDefault = typeof pricingDefaults.$inferSelect;

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

// Two-step login: first userId (birthdate), then PIN
export const userIdLoginSchema = z.object({
  userId: z.string().length(6).regex(/^\d{6}$/, "User ID must be 6 digits (MMDDYY format)"),
});

export const pinLoginSchema = z.object({
  userId: z.string().length(6).regex(/^\d{6}$/, "User ID must be 6 digits (MMDDYY format)"),
  pin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export type UserIdLogin = z.infer<typeof userIdLoginSchema>;
export type PinLogin = z.infer<typeof pinLoginSchema>;

// Partial update schema for products (editable fields)
export const updateProductSchema = z.object({
  distributorId: z.number().nullable().optional(),
  isLocal: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  beverageType: z.enum(beverageTypeEnum).optional(),
  style: z.string().nullable().optional(),
  costPerUnit: z.string().nullable().optional(),
  pricePerUnit: z.string().nullable().optional(),
  pricingMode: z.enum(pricingModeEnum).nullable().optional(),
  servingSizeOz: z.number().nullable().optional(),
  targetPourCost: z.number().nullable().optional(),
  parLevel: z.number().nullable().optional(),
  upc: z.string().nullable().optional(),
  bottleSizeMl: z.number().nullable().optional(),
  emptyWeightGrams: z.number().nullable().optional(),
  fullWeightGrams: z.number().nullable().optional(),
});

export type UpdateProduct = z.infer<typeof updateProductSchema>;
