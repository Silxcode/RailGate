const TrainService = {
    _cache: {},
    _cacheTTL: 30 * 60 * 1000,
    RAILRADAR_API: 'https://api.railradar.in/api/v1',
    API_KEY: null,

    async getLiveStatus(trainNumber) {
        const cached = this._getCache(trainNumber);
        if (cached) return cached;

        try {
            const crowdDelay = this._getCrowdsourcedDelay(trainNumber);
            if (crowdDelay) {
                this._setCache(trainNumber, crowdDelay);
                return crowdDelay;
            }

            const apiData = await this._fetchFromRailRadar(trainNumber);
            if (apiData) {
                this._setCache(trainNumber, apiData);
                return apiData;
            }
        } catch (error) {
            console.warn('Rail Radar API error:', error.message);
        }

        return null;
    },

    _getCache(trainNumber) {
        const cached = this._cache[trainNumber];
        if (!cached) return null;
        if (Date.now() - cached.cachedAt < this._cacheTTL) {
            return cached.data;
        }
        delete this._cache[trainNumber];
        return null;
    },

    _setCache(trainNumber, data) {
        this._cache[trainNumber] = { data, cachedAt: Date.now() };
    },

    async _fetchFromRailRadar(trainNumber) {
        const apiKey = this.API_KEY || CONFIG.RAILRADAR_API_KEY || localStorage.getItem('railradar_api_key');
        if (!apiKey) {
            console.log('Rail Radar API key not set. Using schedule-based predictions.');
            return null;
        }

        const url = `${this.RAILRADAR_API}/trains/${trainNumber}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'X-API-Key': apiKey,
                'User-Agent': 'RailGate/1.0 (Belagavi Railway Gate App)'
            }
        });

        if (!response.ok) {
            throw new Error(`Rail Radar API returned ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.data && data.data.liveData) {
            const liveData = data.data.liveData;
            const metadata = data.data.metadata;
            
            return {
                isDelayed: liveData.overallDelayMinutes > 0,
                delayMinutes: liveData.overallDelayMinutes || 0,
                source: 'railradar',
                lastUpdate: new Date(liveData.lastUpdatedAt),
                currentStation: liveData.currentLocation?.stationCode || null,
                nextStation: null,
                dataSource: liveData.dataSource,
                hasLiveData: metadata.hasLiveData
            };
        }

        return null;
    },

    _getCrowdsourcedDelay(trainNumber) {
        const reports = CrowdService.getDelayReports(trainNumber);
        if (reports.length === 0) return null;

        const now = Date.now();
        const recentReports = reports.filter(r => (now - new Date(r.timestamp)) < 15 * 60 * 1000);

        if (recentReports.length === 0) return null;

        const avgDelay = recentReports.reduce((sum, r) => sum + r.delayMinutes, 0) / recentReports.length;

        return {
            isDelayed: avgDelay > 0,
            delayMinutes: Math.round(avgDelay),
            source: 'crowdsource',
            lastUpdate: new Date(recentReports[0].timestamp),
            reportCount: recentReports.length
        };
    },

    setApiKey(key) {
        this.API_KEY = key;
        localStorage.setItem('railradar_api_key', key);
    },

    async fetchSchedulesForStation(station) {
        console.log(`ℹ️ No static schedules for ${station.code} (using Rail Radar only)`);
        return [];
    }
};

window.TrainService = TrainService;
