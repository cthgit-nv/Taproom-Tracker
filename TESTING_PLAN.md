# Inventory Features Testing Plan

## Test Scenarios

### 1. Scanning Component Tests

#### Test 1.1: Camera Permission Granted
- **Setup**: Grant camera permission
- **Steps**: 
  1. Navigate to inventory session
  2. Select zone and start session
  3. Switch to scan mode
- **Expected**: Camera starts, scanner ready indicator shows
- **Status**: ⏳ Pending

#### Test 1.2: Camera Permission Denied
- **Setup**: Deny camera permission
- **Steps**: 
  1. Navigate to inventory session
  2. Select zone and start session
  3. Switch to scan mode
- **Expected**: Error message shown, auto-switch to manual entry
- **Status**: ⏳ Pending

#### Test 1.3: No Camera Available
- **Setup**: Use device without camera (desktop)
- **Steps**: 
  1. Navigate to inventory session
  2. Select zone and start session
  3. Switch to scan mode
- **Expected**: Error message, fallback to manual entry
- **Status**: ⏳ Pending

#### Test 1.4: Successful Barcode Scan
- **Setup**: Valid barcode available
- **Steps**: 
  1. Start scan mode
  2. Point camera at barcode
  3. Wait for scan
- **Expected**: Product found, count screen opens
- **Status**: ⏳ Pending

#### Test 1.5: Invalid Barcode Scan
- **Setup**: Invalid/unrecognized barcode
- **Steps**: 
  1. Start scan mode
  2. Point camera at invalid barcode
- **Expected**: "Product not found" message, option to create new product
- **Status**: ⏳ Pending

### 2. Completion Flow Tests

#### Test 2.1: Complete with Items Counted
- **Setup**: Session with at least 1 item counted
- **Steps**: 
  1. Count at least 1 item
  2. Click "Complete Inventory" button
  3. Confirm in dialog
- **Expected**: Session completed, redirected to dashboard
- **Status**: ⏳ Pending

#### Test 2.2: Complete with No Items
- **Setup**: Session with 0 items counted
- **Steps**: 
  1. Start session
  2. Try to click "Complete Inventory"
- **Expected**: Button disabled, toast message shown
- **Status**: ⏳ Pending

#### Test 2.3: Review Before Complete
- **Setup**: Session with items counted
- **Steps**: 
  1. Count items
  2. Click "Review Session"
  3. Review variances
  4. Click "Complete & Finish Session"
- **Expected**: Session completed after review
- **Status**: ⏳ Pending

#### Test 2.4: Cancel Completion
- **Setup**: Session with items counted
- **Steps**: 
  1. Click "Complete Inventory"
  2. Click "Cancel" in confirmation dialog
- **Expected**: Dialog closes, session continues
- **Status**: ⏳ Pending

### 3. Offline Mode Tests

#### Test 3.1: Count Items Offline
- **Setup**: Disable network
- **Steps**: 
  1. Start session
  2. Count items
  3. Save counts
- **Expected**: Counts saved to localStorage, offline badge shown
- **Status**: ⏳ Pending

#### Test 3.2: Sync Offline Counts
- **Setup**: Counts saved offline
- **Steps**: 
  1. Re-enable network
  2. Complete session
- **Expected**: Offline counts synced, session completed
- **Status**: ⏳ Pending

### 4. Review Mode Tests

#### Test 4.1: View Variances
- **Setup**: Session with items counted
- **Steps**: 
  1. Count items with variances
  2. Click "Review Session"
- **Expected**: Variances shown, large variances highlighted
- **Status**: ⏳ Pending

#### Test 4.2: Back to Counting from Review
- **Setup**: In review mode
- **Steps**: 
  1. Click "Back to Counting"
- **Expected**: Return to list/scan mode
- **Status**: ⏳ Pending

### 5. Manager Insights Tests

#### Test 5.1: View Insights (Manager)
- **Setup**: Logged in as manager
- **Steps**: 
  1. Navigate to inventory dashboard
  2. Click "View Insights"
- **Expected**: Insights page loads with data
- **Status**: ⏳ Pending

#### Test 5.2: View Insights (Staff)
- **Setup**: Logged in as staff
- **Steps**: 
  1. Navigate to inventory dashboard
- **Expected**: Insights link not visible
- **Status**: ⏳ Pending

## Test Execution

### Automated Tests
Run with: `npm test` (when tests are set up)

### Manual Tests
1. Create test checklist
2. Test on multiple devices
3. Document results
4. Fix issues found
5. Re-test

## Test Data

### Test Products
- Product with valid UPC
- Product without UPC
- Product with large variance
- Product with small variance

### Test Sessions
- Session with 0 items
- Session with 1 item
- Session with many items
- Session with large variances
- Session with offline counts

## Bug Reporting

When bugs are found:
1. Document steps to reproduce
2. Note expected vs actual behavior
3. Include device/browser info
4. Add screenshots if helpful
5. Create issue in tracking system

## Test Results

Results will be documented here as tests are executed.
