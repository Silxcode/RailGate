/**
 * GPS Utilities for RailGate
 * Calculate gate positions relative to stations
 */

const GPSUtils = {
    /**
     * Calculate bearing from station to gate (in degrees)
     * 0° = North, 90° = East, 180° = South, 270° = West
     * @param {number} lat1 - Station latitude
     * @param {number} lng1 - Station longitude
     * @param {number} lat2 - Gate latitude
     * @param {number} lng2 - Gate longitude
     * @returns {number} Bearing in degrees (0-360)
     */
    calculateBearing(lat1, lng1, lat2, lng2) {
        const dLon = this._toRadians(lng2 - lng1);
        const lat1Rad = this._toRadians(lat1);
        const lat2Rad = this._toRadians(lat2);

        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

        let bearing = Math.atan2(y, x);
        bearing = this._toDegrees(bearing);
        bearing = (bearing + 360) % 360; // Normalize to 0-360

        return bearing;
    },

    /**
     * Calculate distance between two points (in meters)
     * Uses Haversine formula
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = this._toRadians(lat2 - lat1);
        const dLon = this._toRadians(lng2 - lng1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._toRadians(lat1)) * Math.cos(this._toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return distance;
    },

    /**
     * Determine gate side relative to station
     * @param {Object} station - Station with {lat, lng}
     * @param {Object} gate - Gate with {lat, lng}
     * @returns {string} 'left', 'right', or 'center'
     */
    determineGateSide(station, gate) {
        const distance = this.calculateDistance(station.lat, station.lng, gate.lat, gate.lng);

        // If gate is very close to station (< 100m), consider it center
        const CENTER_THRESHOLD = 100; // meters
        if (distance < CENTER_THRESHOLD) {
            return 'center';
        }

        const bearing = this.calculateBearing(station.lat, station.lng, gate.lat, gate.lng);

        // Bearings explanation:
        // 0-180° = Right side (East/Southeast/South direction)
        // 180-360° = Left side (West/Northwest/North direction)
        //
        // In Indian railway context:
        // - Most main lines run roughly East-West or North-South
        // - "Left" typically means western/northern approach
        // - "Right" typically means eastern/southern approach

        if (bearing >= 0 && bearing < 180) {
            return 'right';
        } else {
            return 'left';
        }
    },

    /**
     * Get gate side with detailed info for debugging
     */
    analyzeGatePosition(station, gate) {
        const distance = this.calculateDistance(station.lat, station.lng, gate.lat, gate.lng);
        const bearing = this.calculateBearing(station.lat, station.lng, gate.lat, gate.lng);
        const side = this.determineGateSide(station, gate);

        // Determine cardinal direction
        let direction;
        if (bearing >= 337.5 || bearing < 22.5) direction = 'North';
        else if (bearing >= 22.5 && bearing < 67.5) direction = 'Northeast';
        else if (bearing >= 67.5 && bearing < 112.5) direction = 'East';
        else if (bearing >= 112.5 && bearing < 157.5) direction = 'Southeast';
        else if (bearing >= 157.5 && bearing < 202.5) direction = 'South';
        else if (bearing >= 202.5 && bearing < 247.5) direction = 'Southwest';
        else if (bearing >= 247.5 && bearing < 292.5) direction = 'West';
        else direction = 'Northwest';

        return {
            side,
            bearing: Math.round(bearing),
            direction,
            distanceMeters: Math.round(distance),
            isClose: distance < 100
        };
    },

    _toRadians(degrees) {
        return degrees * (Math.PI / 180);
    },

    _toDegrees(radians) {
        return radians * (180 / Math.PI);
    },

    /**
     * Determine if a gate is in the path of an approaching train
     * using OSM track geometry.
     *
     * @param {Object} gate - Gate with {lat, lng}
     * @param {string} stationCode - Target station code
     * @param {Object} progress - Train progress from TrainService
     * @param {Array} tracks - OSM railway track ways from GateService
     * @returns {boolean|null} true = in path, false = not in path, null = cannot determine
     */
    isGateInTrainPath(gate, stationCode, progress, tracks) {
        if (!tracks || tracks.length === 0 || !gate.lat || !gate.lng) {
            return null; // Cannot determine without track data
        }

        // Find which track segment the gate is nearest to
        const gateTrackInfo = this._findNearestTrackPoint(gate.lat, gate.lng, tracks);
        if (!gateTrackInfo || gateTrackInfo.distance > 50) {
            // Gate is more than 50m from any track — not a valid crossing
            return null;
        }

        // If train has already passed the station, gate should be in "post-pass" state
        // regardless of position — handled by the buffer in statusPredictor
        if (progress.hasPassed) {
            return true; // Let buffer logic handle it
        }

        // If train is approaching and we know stationsAway
        if (progress.isApproaching && progress.stationsAway !== undefined) {
            // If train is very close (1-2 stations away), ALL gates near the station
            // should be considered "in path" for safety
            if (progress.stationsAway <= 2) {
                return true;
            }
        }

        // If train has reached the station, all nearby gates are affected
        if (progress.hasReached) {
            return true;
        }

        // Default: we can't definitively exclude this gate
        return null;
    },

    /**
     * Find the nearest point on any track to a given coordinate
     * @returns {{ distance: number, trackIndex: number, segmentIndex: number, point: {lat, lng} } | null}
     */
    _findNearestTrackPoint(lat, lng, tracks) {
        let nearest = null;
        let minDist = Infinity;

        for (let ti = 0; ti < tracks.length; ti++) {
            const track = tracks[ti];
            if (!track.geometry || track.geometry.length < 2) continue;

            for (let si = 0; si < track.geometry.length - 1; si++) {
                const a = track.geometry[si];
                const b = track.geometry[si + 1];

                const projected = this._projectPointOnSegment(
                    lat, lng, a.lat, a.lon, b.lat, b.lon
                );

                const dist = this.calculateDistance(lat, lng, projected.lat, projected.lng);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = {
                        distance: dist,
                        trackIndex: ti,
                        segmentIndex: si,
                        point: projected
                    };
                }
            }
        }

        return nearest;
    },

    /**
     * Project a point onto a line segment (nearest point on line)
     * Returns the closest point on segment AB to point P
     */
    _projectPointOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
        const dx = bLng - aLng;
        const dy = bLat - aLat;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) {
            return { lat: aLat, lng: aLng };
        }

        let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t)); // Clamp to segment

        return {
            lat: aLat + t * dy,
            lng: aLng + t * dx
        };
    }
};

window.GPSUtils = GPSUtils;
