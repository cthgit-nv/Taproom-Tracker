# Manager Insights Dashboard - Implementation Roadmap

## Overview

This document outlines the implementation plan for the Manager Insights Dashboard, which will provide business intelligence and analytics for inventory management.

## Current Status

✅ **Completed:**
- Inventory completion flow improvements
- Scanning component fixes
- Bluetooth scale integration (ready for testing)

⏳ **In Progress:**
- Testing and validation of scale/camera connectivity

📋 **Next Phase:**
- Manager Insights Dashboard implementation

## Phase 1: API Endpoints (Backend)

### Endpoint: `/api/inventory/insights`

**Purpose:** Aggregate inventory data for analytics and reporting

**Response Structure:**
```typescript
interface InventoryInsights {
  // Summary Statistics
  summary: {
    totalSessions: number;
    sessionsLast7Days: number;
    sessionsLast30Days: number;
    averageCompletionTime: number; // minutes
    completionRate: number; // percentage
  };
  
  // Variance Analysis
  variances: {
    productId: number;
    productName: string;
    expectedCount: number;
    actualCount: number;
    variance: number;
    variancePercent: number;
    costImpact: number; // dollar value
    lastCounted: Date;
    countFrequency: number; // times counted in period
  }[];
  
  // Trend Data
  trends: {
    date: string;
    totalItems: number;
    totalValue: number;
    varianceCount: number;
    largeVarianceCount: number;
  }[];
  
  // Zone Statistics
  zones: {
    zoneId: number;
    zoneName: string;
    lastCounted: Date | null;
    daysSinceLastCount: number;
    averageVariance: number;
    completionRate: number;
  }[];
  
  // Product Performance
  productPerformance: {
    productId: number;
    productName: string;
    averageVariance: number;
    varianceTrend: 'improving' | 'worsening' | 'stable';
    countFrequency: number;
    lastCounted: Date;
  }[];
}
```

**Implementation Steps:**
1. Create `server/routes/inventory-insights.ts`
2. Aggregate data from `inventory_sessions` and `inventory_counts` tables
3. Calculate variances and trends
4. Join with `products` table for cost calculations
5. Return structured JSON response

### Endpoint: `/api/inventory/insights/variance-report`

**Purpose:** Detailed variance report with filtering options

**Query Parameters:**
- `zoneId?: number` - Filter by zone
- `startDate?: string` - Start date for report
- `endDate?: string` - End date for report
- `minVariance?: number` - Minimum variance to include
- `sortBy?: 'variance' | 'cost' | 'frequency'` - Sort order

**Response:**
```typescript
interface VarianceReport {
  products: VarianceItem[];
  summary: {
    totalVariance: number;
    totalCostImpact: number;
    averageVariance: number;
    productsWithLargeVariance: number;
  };
}
```

### Endpoint: `/api/inventory/insights/trends`

**Purpose:** Time-series data for trend visualization

**Query Parameters:**
- `days?: number` - Number of days to include (default: 30)
- `zoneId?: number` - Filter by zone

**Response:**
```typescript
interface TrendData {
  dates: string[];
  inventoryLevels: number[];
  varianceCounts: number[];
  completionRates: number[];
}
```

## Phase 2: Frontend Components

### Page: `client/src/pages/inventory-insights.tsx`

**Features:**
1. **Dashboard Overview**
   - Key metrics cards (total sessions, completion rate, average variance)
   - Quick stats for last 7/30 days
   - Zone status summary

2. **Variance Analysis Table**
   - Sortable table of products with variances
   - Filter by zone, date range, variance size
   - Export to CSV functionality
   - Color-coded by variance severity

3. **Trend Charts**
   - Inventory levels over time
   - Variance trends
   - Completion rate trends
   - Using Recharts library (already in dependencies)

4. **Zone Performance**
   - Zone comparison cards
   - Last counted dates
   - Average variances per zone
   - Completion rates

5. **Product Insights**
   - Products with largest variances
   - Products needing attention
   - Variance trends per product

**UI Components Needed:**
- Stats cards (reuse from inventory-dashboard)
- Data table with sorting/filtering
- Line/bar charts (Recharts)
- Date range picker
- Export button

### Component Structure:
```
inventory-insights.tsx
├── InsightsOverview (summary cards)
├── VarianceAnalysisTable (sortable, filterable table)
├── TrendCharts (Recharts components)
├── ZonePerformance (zone comparison)
└── ProductInsights (product-level analysis)
```

## Phase 3: Data Calculations

### Variance Calculations

**Formula:**
```typescript
variance = actualCount - expectedCount
variancePercent = (variance / expectedCount) * 100
costImpact = variance * productCost
```

**Large Variance Threshold:**
- > 2 units for bottles
- > 0.5 kegs for draft beer
- Or > 20% variance

### Trend Calculations

**Inventory Levels:**
- Sum of all product counts at end of each day
- Based on last inventory session per zone

**Variance Trends:**
- Average variance per day
- Count of products with large variances
- Trend direction (improving/worsening)

**Completion Rates:**
- Sessions completed / Sessions started
- Per zone and overall
- Over time periods

## Phase 4: User Experience

### Access Control
- Only visible to users with `role: 'manager'` or `role: 'owner'`
- Staff users see simplified inventory dashboard only

### Navigation
- Add "Insights" link to inventory dashboard (manager only)
- Add to main navigation menu
- Breadcrumb: Dashboard → Inventory → Insights

### Data Refresh
- Auto-refresh every 5 minutes when page is active
- Manual refresh button
- Loading states for all data fetches

### Export Functionality
- Export variance report to CSV
- Export trend data to CSV
- Print-friendly view

## Phase 5: Implementation Order

### Step 1: Backend API (Week 1)
1. Create `server/routes/inventory-insights.ts`
2. Implement `/api/inventory/insights` endpoint
3. Add variance calculations
4. Add trend calculations
5. Test with sample data

### Step 2: Frontend Foundation (Week 1-2)
1. Create `inventory-insights.tsx` page
2. Add route in router
3. Create basic layout
4. Add overview cards
5. Implement data fetching

### Step 3: Variance Table (Week 2)
1. Create sortable table component
2. Add filtering functionality
3. Add export to CSV
4. Style with color coding

### Step 4: Charts (Week 2-3)
1. Install/configure Recharts
2. Create trend line charts
3. Create variance bar charts
4. Add date range filtering

### Step 5: Zone & Product Insights (Week 3)
1. Create zone performance cards
2. Create product insights section
3. Add drill-down functionality

### Step 6: Testing & Refinement (Week 3-4)
1. Test with real data
2. Performance optimization
3. UI/UX refinements
4. User acceptance testing

## Technical Requirements

### Dependencies
- ✅ Recharts (already installed)
- ✅ React Query (already installed)
- ✅ Date-fns (already installed)

### Database Queries
- Aggregate inventory sessions
- Join with products for cost data
- Calculate variances and trends
- Filter by date ranges and zones

### Performance Considerations
- Cache insights data (5-minute TTL)
- Paginate large variance tables
- Lazy load charts
- Optimize database queries with indexes

## Success Metrics

- **Adoption:** >80% of managers use insights weekly
- **Actionability:** >50% of large variances addressed
- **Performance:** Page loads in <2 seconds
- **Accuracy:** Variance calculations match manual checks

## Future Enhancements

1. **Predictive Analytics**
   - Forecast inventory needs
   - Predict when products will run out
   - Identify seasonal patterns

2. **Cost Analysis**
   - Cost of variances
   - ROI of inventory accuracy
   - Waste reduction tracking

3. **Alerts & Notifications**
   - Email alerts for large variances
   - Weekly summary reports
   - Zone completion reminders

4. **Comparative Analysis**
   - Compare zones
   - Compare time periods
   - Benchmark against industry standards

## Notes

- All insights should respect simulation mode (separate training vs production data)
- Data should be aggregated efficiently to avoid performance issues
- Consider adding data retention policies for old sessions
- Ensure insights are actionable, not just informational

## Getting Started

Once testing of scale/camera is complete:

1. Review this roadmap with team
2. Prioritize features based on business needs
3. Start with backend API implementation
4. Iterate based on user feedback

---

**Status:** Ready to begin after scale/camera testing validation
**Estimated Timeline:** 3-4 weeks for full implementation
**Dependencies:** Testing completion, database schema review
