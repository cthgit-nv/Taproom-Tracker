# Inventory System Data Flow Documentation

## Overview

This document clarifies how inventory counts flow through the Taproom Tracker system and when product quantities get updated.

## Key Concepts

### Product Types

The system handles two distinct product types:

1. **Kegs (isSoldByVolume = true)**
   - Draft beer products tracked by volume (ounces)
   - Can be in multiple states: tapped (on tap) or on_deck (in cooler)
   - Tracked in the `kegs` table

2. **Bottles/Cans (isSoldByVolume = false)**
   - Package products sold by unit
   - Tracked as sealed backup units + partial open bottles
   - Stored in `products.backupCount` and `products.currentCountBottles`

### Inventory Count vs. Source of Truth

**Important distinction:**
- **Inventory sessions** record observations/counts at a point in time
- They do NOT immediately become the source of truth for inventory
- Inventory counts are stored in `inventoryCounts` table linked to a session

## Data Flow for Inventory Sessions

### 1. Starting a Session

```
User selects zone → POST /api/inventory/sessions
  ↓
Creates InventorySession record (status: in_progress)
  ↓
Session tagged with simulationMode flag
```

### 2. Counting Products

#### For Bottles/Cans:
```
User counts:
- Partial open bottle: 0-100% slider → stored as partialPercent
- Sealed backup: stepper count → stored as backupCount

On save:
  partialMl = (partialPercent / 100) * bottleSizeMl

POST /api/inventory/counts {
  sessionId,
  productId,
  countedBottles: backupCount,
  countedPartialOz: partialMl,
  isKeg: false
}
```

#### For Kegs:
```
System reads:
- Tapped kegs: PMB service provides real-time remainingOz
  → Converted to keg equivalents (e.g., 800oz / 1984oz = 0.4 kegs)
- Cooler stock: Manual count of full kegs on_deck

On save:
POST /api/inventory/counts {
  sessionId,
  productId,
  countedBottles: coolerStock,
  countedPartialOz: null,
  isKeg: true
}
```

**Important:** Keg counts are OBSERVATIONS ONLY. They do not update the `kegs` table directly.

### 3. Completing a Session

```
User reviews variance report → Clicks "Finish Session"
  ↓
PATCH /api/inventory/sessions/:id { status: "completed" }
  ↓
Session marked complete with timestamp
```

## When Do Product Quantities Get Updated?

### Current Behavior (As-Is)

Product quantities are updated through THREE separate paths:

#### Path 1: Inventory Session Completion
```
When session is marked "completed":
  For each inventoryCount in session:
    - UPDATE products SET
        currentCountBottles = countedPartialOz (for bottles)
        backupCount = countedBottles
      WHERE id = productId
```

**Issue:** This overwrites whatever was there before, even if receiving happened between the start and end of the session.

#### Path 2: Receiving Products
```
When products are received:
  POST /api/receiving →
    UPDATE products SET backupCount = backupCount + receivedQuantity

  For kegs:
    INSERT INTO kegs (status: 'on_deck', productId, ...)
```

**Issue:** If an inventory session is in progress, the receiving update will be overwritten when the session completes.

#### Path 3: GoTab Sales Sync
```
Daily sync from POS:
  For each sale:
    UPDATE products SET backupCount = backupCount - soldQuantity
```

**Issue:** Same race condition as receiving.

### Recommended Behavior (Should-Be)

To fix the data flow issues, we recommend:

#### Option A: Inventory Sessions as Absolute Source of Truth

1. When a session completes, it SETS the inventory (not increments)
2. Lock out receiving/sales updates during active sessions for that zone
3. Show warning if products changed since session started

```
Session completion:
  BEGIN TRANSACTION

  FOR each count:
    Check if product modified since session.startedAt
    IF modified:
      Log warning / flag for review

    UPDATE products SET
      currentCountBottles = count.partialOz,
      backupCount = count.countedBottles,
      lastCountedAt = NOW()

  COMMIT
```

#### Option B: Inventory Sessions as Adjustments

1. Track the delta between expected and counted
2. Apply adjustment rather than absolute set
3. Maintains receiving/sales changes during session

```
Session completion:
  FOR each count:
    expected = product.currentCountBottles + product.backupCount
    actual = count.totalUnits
    delta = actual - expected

    IF delta != 0:
      INSERT INTO inventoryAdjustments (productId, delta, reason: 'physical_count')
      UPDATE products based on delta
```

## Keg Lifecycle and Inventory

### Keg States
- `on_deck`: Full keg in cooler (counted in inventory cooler stock)
- `tapped`: Keg on tap (tracked by PMB, not manually counted)
- `kicked`: Empty keg (no longer in inventory)

### How Kegs Interact with Inventory

**Tapped Kegs:**
- Real-time volume from PMB service (remainingOz, fillLevelPercent)
- Displayed to user during count but NOT manually adjusted
- Observation only - used to calculate total on-hand

**On-Deck Kegs (Cooler Stock):**
- Manually counted by user (how many full kegs in cooler?)
- This is what gets saved as `countedBottles` for keg products
- Should reconcile with `SELECT COUNT(*) FROM kegs WHERE status='on_deck' AND productId=X`

**Variance Detection:**
When cooler stock count != database on_deck count:
- Flag for review in variance report
- User confirms which is correct
- System creates adjustment record

## Offline Mode

When offline:
```
Counts saved to localStorage as OfflineCount[]
  ↓
When connection returns:
  Auto-sync to server
  POST /api/inventory/counts for each offline count
```

**Limitation:** If session was completed on another device while offline, sync may create conflicts.

## Simulation Mode

All inventory operations check `settings.simulationMode`:
- If true: sessions tagged with `isSimulation: true`
- Queries filter by simulation flag
- Prevents test data from mixing with production

```sql
SELECT * FROM inventorySessions
WHERE isSimulation = (SELECT simulationMode FROM settings)
```

## Database Schema Reference

### Key Tables

**inventorySessions**
- id, zoneId, userId, status, startedAt, completedAt, isSimulation

**inventoryCounts**
- id, sessionId, productId, countedBottles, countedPartialOz, isManualEstimate

**products**
- backupCount: Sealed units in backup
- currentCountBottles: Partial open bottle (as decimal, e.g., 0.5)
- isSoldByVolume: true = keg, false = bottle

**kegs**
- status: 'on_deck' | 'tapped' | 'kicked'
- productId, remainingVolOz, initialVolOz

## API Endpoints

### Inventory Session Lifecycle

```
POST   /api/inventory/sessions        Start new session
GET    /api/inventory/sessions/:id    Get session details
PATCH  /api/inventory/sessions/:id    Update session (complete/cancel)
POST   /api/inventory/counts           Save count for a product
GET    /api/kegs/product/:id/summary   Get keg summary (tapped + cooler)
```

## Audit Logging (Planned)

To track all inventory changes, we recommend adding:

```
inventoryAuditLog:
  - id
  - productId
  - changeType: 'count' | 'receive' | 'sale' | 'adjustment'
  - oldValue
  - newValue
  - delta
  - userId
  - sessionId (if from inventory session)
  - reason
  - timestamp
```

This will help reconcile discrepancies and understand why inventory changed.

## Common Scenarios

### Scenario 1: Normal Inventory Count
```
1. User starts session for "Back Bar" zone
2. Scans/selects 10 products
3. For each: counts partial + sealed backup
4. Reviews variance report (expected vs. counted)
5. Submits session
6. Products.backupCount updated for all 10 products
```

### Scenario 2: Keg Counting
```
1. User selects a draft beer product
2. System fetches:
   - Tapped kegs from PMB (e.g., Tap 3 = 65% full)
   - On-deck kegs from database (e.g., 2 full kegs in cooler)
3. User manually adjusts cooler count if wrong (e.g., actually 3 kegs)
4. Total = 0.65 + 3 = 3.65 keg equivalents
5. Saved as observation in inventoryCounts
```

### Scenario 3: Receiving During Active Session
```
PROBLEM:
1. User starts inventory session 9:00 AM
2. Delivery arrives 9:30 AM, staff receives 6 bottles of Product X
   → backupCount updated: 4 → 10
3. User counts Product X at 9:45 AM, finds 10 bottles
   → Saves count: 10
4. User completes session 10:00 AM
   → Products updated: backupCount = 10 ✓ (correct)

But if user had counted at 9:15 AM (before delivery):
1. User counts 4 bottles at 9:15 AM
2. Delivery at 9:30 AM: backupCount becomes 10
3. Session completes 10:00 AM: backupCount set to 4 ✗ (wrong!)

SOLUTION: Lock products in active zone OR show warning on completion
```

## Next Steps

1. **Add audit logging** to track all inventory changes
2. **Implement locking** to prevent receiving/sales during active sessions
3. **Add reconciliation UI** for keg count variances
4. **Create session history view** to see what changed in each session
5. **Add "confirm counts" step** before final submission with highlighted variances
