# Bluetooth Scale & Camera Testing Guide

## Overview

This document outlines the testing strategy for Bluetooth scale connectivity and camera scanning functionality, including browser compatibility and user-friendly connection methods.

## Browser Compatibility

### Web Bluetooth API Support

| Browser | Platform | Support | Notes |
|---------|----------|---------|-------|
| Chrome | Desktop (Windows/Mac/Linux) | ✅ Full | Native support |
| Chrome | Android | ✅ Full | Native support |
| Edge | Desktop | ✅ Full | Native support |
| Edge | Android | ✅ Full | Native support |
| Safari | iOS | ❌ Not Supported | Requires Bluefy browser |
| Safari | macOS | ⚠️ Limited | Requires user gesture |
| Firefox | All | ❌ Not Supported | No Web Bluetooth API |

### Recommended Setup

**For iOS Users:**
- **Bluefy Browser** (Recommended)
  - Download from App Store: https://apps.apple.com/app/bluefy/id1492822055
  - Provides Web Bluetooth API support on iOS
  - Free and open-source
  - Instructions:
    1. Install Bluefy from App Store
    2. Open Bluefy browser
    3. Navigate to your inventory app URL
    4. Connect Bluetooth scale as normal

**For Android/Desktop:**
- Use Chrome or Edge browser (native support)

## Bluetooth Scale Connection Testing

### Test 1: Initial Connection
**Steps:**
1. Open inventory app in supported browser
2. Navigate to inventory session setup
3. Ensure Bluetooth scale is:
   - Turned on
   - In pairing mode (if required)
   - Within range (within 10 feet)
4. Click "Connect" button on Bluetooth Scale card
5. Select scale from device list (if multiple devices appear)

**Expected:**
- Browser shows device selection dialog
- Scale appears in list
- Connection succeeds
- "Connected" status shown
- Current weight displayed (if available)

**Failure Cases:**
- No devices found → Check scale is on and in pairing mode
- Permission denied → Grant Bluetooth permission in browser
- Connection timeout → Check scale is nearby and powered on

### Test 2: Weight Reading
**Steps:**
1. Connect scale (from Test 1)
2. Place item on scale
3. Wait for weight to stabilize

**Expected:**
- Weight updates in real-time
- Weight displayed in grams
- Percentage calculated automatically (if product weights configured)

**Failure Cases:**
- No weight reading → Check scale is sending data
- Incorrect weight → May need to configure scale data format

### Test 3: Connection Persistence
**Steps:**
1. Connect scale
2. Navigate away from inventory page
3. Return to inventory page
4. Check if scale reconnects automatically

**Expected:**
- Scale attempts to reconnect automatically
- Connection restored if scale is still available
- Manual reconnect option if auto-reconnect fails

### Test 4: Disconnection Handling
**Steps:**
1. Connect scale
2. Turn off scale or move out of range
3. Observe app behavior

**Expected:**
- App detects disconnection
- Shows disconnected status
- Provides reconnect button
- Attempts auto-reconnect (up to 3 times)

### Test 5: Multiple Devices
**Steps:**
1. Have multiple Bluetooth devices nearby
2. Connect scale
3. Verify correct device selected

**Expected:**
- Device selection shows all nearby devices
- Scale can be identified by name
- Correct device connects

## Camera Scanning Testing

### Test 1: Camera Permission
**Steps:**
1. Open inventory session
2. Switch to scan mode
3. Grant/deny camera permission

**Expected (Permission Granted):**
- Camera activates
- Scanner ready indicator shows
- Barcode scanning works

**Expected (Permission Denied):**
- Error message displayed
- Auto-switch to manual entry
- Clear instructions shown

### Test 2: Barcode Scanning
**Steps:**
1. Grant camera permission
2. Point camera at barcode
3. Wait for scan

**Expected:**
- Barcode detected quickly (< 2 seconds)
- Product found or "new product" dialog shown
- Count screen opens automatically

**Failure Cases:**
- No scan → Check lighting, barcode quality
- Wrong product → Verify UPC in database
- Multiple scans → Debouncing should prevent duplicates

### Test 3: Camera Device Selection
**Steps:**
1. On device with multiple cameras
2. Start scan mode
3. Verify correct camera used

**Expected:**
- Back camera used by default (better for scanning)
- Front camera available as fallback
- Camera switches if needed

### Test 4: Low Light Conditions
**Steps:**
1. Test scanning in dim lighting
2. Test scanning in bright lighting
3. Test scanning with glare

**Expected:**
- Scanner adapts to lighting
- Still able to scan (may be slower)
- Clear error if too dark

### Test 5: Offline Scanning
**Steps:**
1. Disable network connection
2. Attempt to scan barcode
3. Verify offline handling

**Expected:**
- Scanning still works (camera is local)
- Product lookup uses cached data
- New products can be created offline
- Counts saved locally

## Integration Testing

### Test 1: Scale + Camera Workflow
**Steps:**
1. Connect Bluetooth scale
2. Scan product barcode
3. Place product on scale
4. Verify weight auto-populates

**Expected:**
- Smooth workflow
- Weight updates automatically
- Percentage calculated correctly

### Test 2: Quick Scan Mode
**Steps:**
1. Enable quick scan mode
2. Connect scale
3. Scan multiple products rapidly

**Expected:**
- Each scan opens count screen
- Weight auto-reads from scale
- Quick save and return to scan
- No connection drops

### Test 3: Session Persistence
**Steps:**
1. Start inventory session
2. Connect scale
3. Close browser tab
4. Reopen app
5. Continue session

**Expected:**
- Session restored
- Scale reconnection attempted
- All counts preserved

## Device-Specific Testing

### iOS (Bluefy Browser)
- [ ] Install Bluefy from App Store
- [ ] Open app in Bluefy
- [ ] Connect Bluetooth scale
- [ ] Test weight readings
- [ ] Test camera scanning
- [ ] Test connection persistence

### Android (Chrome)
- [ ] Open app in Chrome
- [ ] Grant Bluetooth permission
- [ ] Connect scale
- [ ] Test weight readings
- [ ] Test camera scanning
- [ ] Test connection persistence

### Desktop (Chrome/Edge)
- [ ] Open app in browser
- [ ] Connect Bluetooth scale (if available)
- [ ] Test camera scanning (if webcam available)
- [ ] Verify fallback to manual entry

## Troubleshooting

### Scale Won't Connect
1. Check scale is turned on
2. Check scale is in pairing mode
3. Check browser supports Web Bluetooth
4. Check Bluetooth is enabled on device
5. Check scale is within range
6. Try disconnecting and reconnecting

### Camera Won't Start
1. Check camera permission granted
2. Check no other app using camera
3. Check browser supports camera API
4. Try refreshing page
5. Try manual entry mode

### Weight Not Updating
1. Check scale is connected
2. Check item is on scale
3. Check scale is sending data
4. Try reconnecting scale
5. Check scale data format compatibility

### Connection Drops
1. Check scale battery level
2. Check distance from scale
3. Check for interference
4. Try reconnecting
5. Check browser/device Bluetooth status

## Success Criteria

- ✅ Scale connects successfully on first try (>90% of time)
- ✅ Weight readings update in real-time
- ✅ Connection persists across page navigation
- ✅ Camera scanning works reliably (>95% success rate)
- ✅ Fallback to manual entry works when needed
- ✅ User-friendly error messages guide users

## Next Steps

1. Test on real devices (iOS with Bluefy, Android with Chrome)
2. Gather user feedback on connection experience
3. Refine error messages based on common issues
4. Add connection status indicators
5. Implement connection retry logic improvements
