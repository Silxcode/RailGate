/**
 * Service to search and manage Indian railway stations
 * Data source: 8,990 stations from datameet/railways GitHub
 */
const StationService = {
    stations: [],
    stationsByCity: new Map(),
    stationsByCode: new Map(),

    /**
     * Load and index all stations
     */
    async init() {
        try {
            const response = await fetch('/data/stations.json');
            const geojson = await response.json();

            this.stations = geojson.features
                .filter(f => f.geometry && f.geometry.coordinates)
                .map(f => ({
                    code: f.properties.code,
                    name: f.properties.name,
                    state: f.properties.state,
                    zone: f.properties.zone,
                    address: f.properties.address,
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                    city: this.extractCity(f.properties.address, f.properties.name)
                }));

            console.log(`✅ Loaded ${this.stations.length} railway stations`);

            // Index by city
            this.indexByCity();
            this.indexByCode();

        } catch (error) {
            console.error('Failed to load stations:', error);
            return false;
        }
    },

    /**
     * Extract city name from address/name
     */
    extractCity(address, name) {
        if (!address) return name.split(' ')[0]; // Fallback to first word of name

        // Extract city from address (usually after last comma)
        const parts = address.split(',').map(s => s.trim());
        return parts[parts.length - 2] || parts[0]; // Second-to-last or first
    },

    /**
     * Index stations by city for fast lookup
     */
    indexByCity() {
        this.stations.forEach(station => {
            const city = station.city;
            if (!this.stationsByCity.has(city)) {
                this.stationsByCity.set(city, []);
            }
            this.stationsByCity.get(city).push(station);
        });
    },

    /**
     * Index stations by code for fast lookup
     */
    indexByCode() {
        this.stations.forEach(station => {
            this.stationsByCode.set(station.code, station);
        });
    },

    /**
     * Search cities by name (fuzzy)
     */
    searchCities(query) {
        if (!query || query.length < 2) return [];

        const lowerQuery = query.toLowerCase();
        const cities = Array.from(this.stationsByCity.keys())
            .filter(city => city.toLowerCase().includes(lowerQuery))
            .slice(0, 10); // Top 10 matches

        return cities.map(city => ({
            name: city,
            stationCount: this.stationsByCity.get(city).length
        }));
    },

    /**
     * Get all stations in a city
     */
    getStationsByCity(cityName) {
        return this.stationsByCity.get(cityName) || [];
    },

    /**
     * Get station by code
     */
    getStationByCode(code) {
        return this.stationsByCode.get(code);
    },

    /**
     * Get popular cities (cities with most stations)
     */
    getPopularCities(limit = 20) {
        return Array.from(this.stationsByCity.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, limit)
            .map(([city, stations]) => ({
                name: city,
                stationCount: stations.length,
                mainStation: stations[0] // First station as representative
            }));
    }
};

window.StationService = StationService;
