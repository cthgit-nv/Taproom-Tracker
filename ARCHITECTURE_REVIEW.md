# Architecture Review: Taproom Tracker

## Executive Summary

This review identifies bloat, duplication, and unnecessary complexity in the Taproom Tracker codebase. The primary concerns are:

1. **Massive monolithic routes file** (1,782 lines)
2. **Extensive code duplication** in authentication, error handling, and data access
3. **Missing middleware abstractions** for common patterns
4. **Inconsistent API patterns** between client and server

---

## Critical Issues

### 1. Monolithic Routes File (`server/routes.ts`)

**Problem:** All 54+ routes are defined in a single 1,782-line file, making it:
- Difficult to navigate and maintain
- Hard to test individual route groups
- Prone to merge conflicts
- Violates single responsibility principle

**Impact:** High - affects maintainability and developer productivity

**Recommendation:**
```
server/
  routes/
    index.ts          # Route registration
    auth.ts           # Authentication routes
    products.ts       # Product CRUD
    inventory.ts      # Inventory sessions/counts
    orders.ts         # Orders and order items
    kegs.ts           # Keg management
    integrations.ts   # GoTab, Untappd, BarcodeSpider
    admin.ts          # Admin-only routes
    settings.ts       # Settings management
```

---

### 2. Duplicate Route Definition

**Problem:** `/api/products/:id` is defined twice:
- Line 359: `app.get("/api/products/:id", ...)`
- Line 927: `app.get("/api/products/:id", ...)`

**Impact:** Medium - second definition will never be reached

**Recommendation:** Remove the duplicate at line 927

---

### 3. Repeated Authentication/Authorization Checks

**Problem:** The same authentication pattern is repeated 24+ times:
```typescript
if (!req.session.userId) {
  return res.status(401).json({ error: "Not authenticated" });
}
const currentUser = await storage.getUser(req.session.userId);
if (!currentUser || !["admin", "owner"].includes(currentUser.role)) {
  return res.status(403).json({ error: "Admin access required" });
}
```

**Impact:** High - violates DRY principle, hard to maintain

**Recommendation:** Create middleware:
```typescript
// server/middleware/auth.ts
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
};

export const requireRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    req.user = user; // Attach to request
    next();
  };
};

// Usage:
app.post("/api/products", requireAuth, requireRole("admin", "owner"), handler);
```

---

### 4. Repetitive Error Handling

**Problem:** Every route has identical try-catch blocks:
```typescript
try {
  // ... route logic
} catch (error) {
  console.error("Operation error:", error);
  return res.status(500).json({ error: "Internal server error" });
}
```

**Impact:** Medium - code duplication, inconsistent error messages

**Recommendation:** Use Express error handling middleware:
```typescript
// Wrap async handlers
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handler (already exists in index.ts, but routes should use it)
```

---

### 5. Repeated Simulation Mode Checks

**Problem:** The pattern of getting settings and checking simulation mode is repeated:
```typescript
const settings = await storage.getSettings();
const isSimulation = settings?.simulationMode ?? false;
```

**Impact:** Medium - unnecessary database queries, code duplication

**Recommendation:** Cache settings or use middleware:
```typescript
// Cache settings in memory with TTL
// Or attach to request via middleware
app.use(async (req, res, next) => {
  req.settings = await storage.getSettings();
  next();
});
```

---

### 6. Storage Layer Repetition

**Problem:** `server/storage.ts` has repetitive CRUD operations following the same pattern:
```typescript
async getX(id: number): Promise<X | undefined> {
  const [result] = await db.select().from(x).where(eq(x.id, id));
  return result || undefined;
}
```

**Impact:** Low-Medium - not critical but could be abstracted

**Recommendation:** Consider a generic repository pattern for simple CRUD:
```typescript
class Repository<T> {
  constructor(private table: any, private idField: any) {}
  
  async findById(id: number): Promise<T | undefined> {
    const [result] = await db.select()
      .from(this.table)
      .where(eq(this.idField, id));
    return result || undefined;
  }
  
  // ... other common operations
}
```

---

### 7. Client-Side Service Duplication

**Problem:** Client-side services (`GoTabService`, `UntappdService`, `PourMyBeerService`) exist but:
- Most API calls are made directly via `fetch()` in components
- Services are not consistently used
- Some services duplicate server-side logic

**Impact:** Medium - inconsistent patterns, potential confusion

**Recommendation:**
- **Option A:** Remove client services, use direct API calls consistently
- **Option B:** Fully adopt services and remove direct `fetch()` calls
- **Option C:** Create a unified API client that wraps all calls

**Current Usage:**
- `GoTabService`: Partially used (syncSalesData, fetchDailySales)
- `UntappdService`: Used for search, but also direct fetch calls exist
- `PourMyBeerService`: Used for PMB integration

---

### 8. Repeated PIN Verification Logic

**Problem:** PIN verification with fallback for plain text is duplicated:
```typescript
const user = users.find(u => {
  try {
    return verifyPin(pin, u.pinCode) || u.pinCode === pin;
  } catch {
    return u.pinCode === pin;
  }
});
```

**Impact:** Low - appears in 2-3 places (login, user creation)

**Recommendation:** Extract to a utility function:
```typescript
// server/security.ts
export async function findUserByPin(pin: string): Promise<User | undefined> {
  const users = await storage.getAllUsers();
  return users.find(u => {
    try {
      return verifyPin(pin, u.pinCode) || u.pinCode === pin;
    } catch {
      return u.pinCode === pin;
    }
  });
}
```

---

### 9. Inconsistent API Call Patterns

**Problem:** Mixed usage of:
- `apiRequest()` helper (from `queryClient.ts`)
- Direct `fetch()` calls
- React Query `useQuery` with `getQueryFn`

**Impact:** Medium - inconsistent error handling and request configuration

**Recommendation:** Standardize on one pattern:
- Use `apiRequest()` for mutations
- Use React Query for queries (already mostly done)
- Remove direct `fetch()` calls

---

### 10. Unused UI Components

**Problem:** 32 Radix UI component files exist, but usage is unclear

**Impact:** Low - may increase bundle size if unused

**Recommendation:** Audit component usage:
```bash
# Check which components are imported
grep -r "from.*@/components/ui" client/src
```

---

## Moderate Issues

### 11. Large Page Components

**Problem:** Some page components are very large:
- `inventory-session.tsx`: ~1,482 lines
- `receiving.tsx`: ~1,112 lines

**Impact:** Medium - harder to maintain and test

**Recommendation:** Split into smaller components:
- Extract hooks for business logic
- Extract sub-components for UI sections
- Use composition patterns

---

### 12. Hardcoded Values

**Problem:** Magic numbers and strings scattered throughout:
- `1984` (keg volume in oz)
- `"prd_"` (placeholder UPC prefix)
- Rate limit values: `5, 15 * 60 * 1000`

**Impact:** Low - but makes configuration harder

**Recommendation:** Extract to constants:
```typescript
// server/constants.ts
export const KEG_STANDARD_VOLUME_OZ = 1984; // 1/2 barrel
export const PLACEHOLDER_UPC_PREFIX = "prd_";
export const RATE_LIMIT_LOGIN = { max: 5, windowMs: 15 * 60 * 1000 };
```

---

### 13. Missing Type Safety

**Problem:** Some areas use `any` or loose typing:
- `Record<string, any>` in update operations
- `as any` type assertions

**Impact:** Low-Medium - reduces type safety

**Recommendation:** Use proper types from schema or create update types

---

## Recommendations Priority

### High Priority (Do First)
1. ✅ Split `routes.ts` into domain-specific files
2. ✅ Create authentication/authorization middleware
3. ✅ Remove duplicate `/api/products/:id` route
4. ✅ Standardize API call patterns

### Medium Priority
5. Create error handling middleware
6. Cache settings to reduce repeated queries
7. Extract PIN verification utility
8. Refactor large page components

### Low Priority
9. Abstract storage layer (if needed)
10. Audit and remove unused UI components
11. Extract constants
12. Improve type safety

---

## Code Quality Metrics

- **Routes file size:** 1,782 lines (should be <200 per file)
- **Duplicate route definitions:** 1
- **Repeated auth checks:** 24+
- **Repeated error handlers:** 50+
- **Repeated simulation checks:** 10+
- **Largest component:** 1,482 lines (should be <500)

---

## Conclusion

The codebase is functional but suffers from significant duplication and organizational issues. The primary refactoring should focus on:

1. **Route organization** - Split into domain files
2. **Middleware extraction** - Auth, error handling, settings
3. **Pattern consistency** - Standardize API calls and error handling

These changes will significantly improve maintainability and reduce the risk of bugs from copy-paste errors.
