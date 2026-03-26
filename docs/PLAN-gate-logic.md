# [PLAN] Improve Gate Status Prediction Accuracy

## ✅ Implemented

### Option B: Pessimistic Buffer (Safety-First)
- **90-second post-pass buffer**: Gate stays "Closed" after a train passes to prevent false-open.
- **3-minute soft lock**: After the 90s, gate shows "Warning" before flipping to "Open".
- **Back-to-back train lock**: All approaching trains are evaluated; gate stays closed for the worst-case.
- **Removed broken left/right side logic**: The crude bearing-based approach was the primary cause of false-opens.

### Option A: Track-Segment Vector Analysis (Precision)
- **`GPSUtils.isGateInTrainPath()`**: Uses OSM track geometry to determine if a gate coordinate lies near the actual railway track (within 50m).
- **`GPSUtils._findNearestTrackPoint()`**: Projects gate coordinates onto track segments to find the closest point.
- **Safety-first proximity**: When a train is ≤2 stations away, ALL nearby gates are considered "in path".

## Files Modified
| File | Change |
|------|--------|
| `js/services/statusPredictor.js` | Refactored prediction engine |
| `js/services/gpsUtils.js` | Added track-vector analysis |

## Verification
- [x] Syntax check passed (`node -c`)
- [ ] Manual testing in browser (BGM station)
