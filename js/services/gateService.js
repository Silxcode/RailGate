/**
 * Service to manage railway gate data
 */
const GateService = {
    railwayTracks: [],

    async fetchGatesNearStation(station) {
        console.log(`�� Fetching gates for ${station.name} (${station.code})`);
        
        const cacheKey = `gates_${station.code}`;
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            console.log(`✅ Using cached gates for ${station.code}`);
            this.railwayTracks = cached.tracks || [];
            return cached.gates;
        }

        // Try OSM first
        let osmGates = await this.fetchFromOSM(station);
        
        // If OSM returns 0 gates, use fallback
        if (osmGates.length === 0) {
            console.log(`⚠️ OSM returned 0 gates, using fallback for ${station.code}`);
            osmGates = this.getFallbackGates(station.code);
        }

        // Add crowdsourced gates
        const crowdGates = CrowdService.getApprovedGates(station.code);
        const allGates = [...osmGates, ...crowdGates];
        
        this.saveToCache(cacheKey, { gates: allGates, tracks: this.railwayTracks });
        console.log(`📍 Total gates: ${allGates.length} (${osmGates.length} OSM + ${crowdGates.length} crowd)`);
        
        return allGates;
    },

    async fetchFromOSM(station) {
        const radius = 5000;
        const query = `
            [out:json][timeout:25];
            (
              node["railway"="level_crossing"](around:${radius}, ${station.lat}, ${station.lng});
              way["railway"="rail"](around:${radius}, ${station.lat}, ${station.lng});
            );
            out geom;
        `;

        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query)
            });
            
            if (!response.ok) throw new Error('OSM fetch failed');
            
            const data = await response.json();
            const gates = data.elements.filter(el => el.type === 'node');
            const tracks = data.elements.filter(el => el.type === 'way');
            
            this.railwayTracks = tracks;
            
            return gates.map((gate, i) => ({
                id: `osm_${gate.id}`,
                name: gate.tags?.name || `Gate #${i + 1}`,
                lat: gate.lat,
                lng: gate.lon,
                source: 'osm',
                stationCode: station.code
            }));
        } catch (error) {
            console.error('OSM fetch failed:', error);
            return [];
        }
    },

    getFallbackGates(stationCode) {
        // Belagavi gates
        const fallbackData = {
            BGM: [
                { id: 'bgm_1', name: 'Hindwadi Railway Crossing', lat: 15.8652, lng: 74.5089 },
                { id: 'bgm_2', name: 'Tilakwadi Gate', lat: 15.8523, lng: 74.4912 },
                { id: 'bgm_3', name: 'Second Railway Gate', lat: 15.8497, lng: 74.5134 },
                { id: 'bgm_4', name: 'Camp Area Crossing', lat: 15.8389, lng: 74.5023 },
                { id: 'bgm_5', name: 'Udyamnagar Gate', lat: 15.8612, lng: 74.4856 }
            ],
            UBL: [
                { id: 'ubl_1', name: 'Gokul Road Crossing', lat: 15.3647, lng: 75.1239 },
                { id: 'ubl_2', name: 'Unkal Lake Gate', lat: 15.3523, lng: 75.1402 }
            ]
        };

        const gates = fallbackData[stationCode] || [];
        return gates.map(g => ({ ...g, source: 'fallback', stationCode }));
    },

    isPointNearTrack(lat, lng, threshold = 0.0003) {
        if (this.railwayTracks.length === 0) return true;
        
        return this.railwayTracks.some(track => {
            if (!track.geometry) return false;
            return track.geometry.some(point => {
                const dist = Math.sqrt(Math.pow(point.lat - lat, 2) + Math.pow(point.lon - lng, 2));
                return dist < threshold;
            });
        });
    },

    getFromCache(key) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 24*60*60*1000) return data;
            localStorage.removeItem(key);
        } catch {}
        return null;
    },

    saveToCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (err) {
            console.warn('Cache failed:', err);
        }
    }
};

window.GateService = GateService;
