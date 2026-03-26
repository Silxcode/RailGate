/**
 * Station to Zone Mapping Helper
 * Maps station codes to their railway zones
 */

const StationZoneMapper = {
    // Build reverse lookup from zones to stations
    _stationToZoneMap: null,

    /**
     * Initialize the station-to-zone mapping
     */
    init() {
        if (this._stationToZoneMap) return; // Already initialized

        this._stationToZoneMap = new Map();

        if (typeof RAILWAY_ZONES === 'undefined') {
            console.error('RAILWAY_ZONES not loaded');
            return;
        }

        // Build reverse lookup
        RAILWAY_ZONES.forEach(zone => {
            zone.stations.forEach(stationCode => {
                this._stationToZoneMap.set(stationCode.toUpperCase(), zone);
            });
        });

        console.log(`📍 Mapped ${this._stationToZoneMap.size} stations to zones`);
    },

    /**
     * Get zone for a station code
     * @param {string} stationCode - Station code (e.g., 'BGM', 'UBL')
     * @returns {Object|null} Zone object or null if not found
     */
    getZoneForStation(stationCode) {
        this.init();

        const zone = this._stationToZoneMap.get(stationCode.toUpperCase());

        if (!zone) {
            console.warn(`Station ${stationCode} not found in zone mapping`);
            return null;
        }

        console.log(`📍 ${stationCode} belongs to ${zone.name} (${zone.id})`);
        return zone;
    },

    /**
     * Get all stations in the same zone as the given station
     * @param {string} stationCode - Reference station code
     * @returns {Array} List of station codes in the same zone
     */
    getZoneStations(stationCode) {
        const zone = this.getZoneForStation(stationCode);
        return zone ? zone.stations : [];
    },

    /**
     * Check if a station exists in our mapping
     * @param {string} stationCode - Station code to check
     * @returns {boolean}
     */
    hasStation(stationCode) {
        this.init();
        return this._stationToZoneMap.has(stationCode.toUpperCase());
    }
};

window.StationZoneMapper = StationZoneMapper;
