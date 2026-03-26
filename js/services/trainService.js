const TrainService = {
    _cache: {},
    // Separate cache TTLs for different data types
    _cacheTTL: {
        trainPosition: 2 * 60 * 1000,      // 2 minutes - real-time critical
        stationSchedules: 60 * 60 * 1000,  // 1 hour - static data
        trainProgress: 2 * 60 * 1000       // 2 minutes - real-time critical
    },
    // Point to our unified proxy endpoint
    RAILRADAR_API: '/api/railradar',
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

    _getCache(trainNumber, cacheType = 'trainPosition') {
        const cached = this._cache[trainNumber];
        if (!cached) return null;

        const ttl = this._cacheTTL[cacheType] || this._cacheTTL.trainPosition;
        const age = Date.now() - cached.cachedAt;

        if (age < ttl) {
            console.log(`✅ Using cached ${cacheType} for ${trainNumber} (age: ${Math.round(age / 1000)}s)`);
            return cached.data;
        }

        console.log(`⏰ Cache expired for ${trainNumber} (age: ${Math.round(age / 1000)}s, ttl: ${ttl / 1000}s)`);
        delete this._cache[trainNumber];
        return null;
    },

    _setCache(trainNumber, data, cacheType = 'trainPosition') {
        this._cache[trainNumber] = {
            data,
            cachedAt: Date.now(),
            cacheType,
            ttl: this._cacheTTL[cacheType]
        };
        console.log(`💾 Cached ${cacheType} for ${trainNumber}`);
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

    /**
     * Fetch trains approaching a specific station (Real-time from RailRadar)
     * @param {string} stationCode - Station code (e.g., 'BGM')
     * @param {number} hoursAhead - Look ahead window (default: 2 hours)
     * @returns {Array} Trains with arrival/departure times and delays
     */
    async fetchTrainsApproachingStation(stationCode, hoursAhead = 2) {
        const apiKey = this.API_KEY || CONFIG.RAILRADAR_API_KEY || localStorage.getItem('railradar_api_key');

        if (!apiKey) {
            console.log('⚠️ Rail Radar API key not set. Cannot fetch live arrivals.');
            return [];
        }

        const url = `${this.RAILRADAR_API}/stations/${stationCode}/live?hours=${hoursAhead}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'X-API-Key': apiKey
                }
            });

            if (!response.ok) {
                throw new Error(`RailRadar API returned ${response.status}`);
            }

            const data = await response.json();

            if (!data.success || !data.data || !data.data.trains) {
                return [];
            }

            // Transform to app format
            const now = new Date();
            const trains = data.data.trains
                .filter(t => t.schedule.arrival) // Only trains that arrive (not just departures)
                .map(t => {
                    const scheduledArrival = this._parseTime(t.schedule.arrival);
                    const expectedArrival = this._parseTime(t.live?.expectedArrival || t.schedule.arrival);

                    return {
                        number: t.train.number,
                        name: t.train.name,
                        scheduledArrival: t.schedule.arrival,
                        expectedArrival: t.live?.expectedArrival || t.schedule.arrival,
                        delayMinutes: this._calculateDelay(scheduledArrival, expectedArrival),
                        minutesUntilArrival: this._minutesUntil(expectedArrival, now),
                        hasArrived: t.status?.hasArrived || false,
                        hasDeparted: t.status?.hasDeparted || false,
                        isCancelled: t.status?.isCancelled || false,
                        platform: t.platform || 'N/A'
                    };
                })
                .filter(t => !t.hasArrived && !t.isCancelled) // Only upcoming trains
                .sort((a, b) => a.minutesUntilArrival - b.minutesUntilArrival);

            console.log(`✅ Found ${trains.length} upcoming trains for ${stationCode}`);
            return trains;

        } catch (error) {
            console.warn('Rail Radar station arrivals error:', error.message);
            return [];
        }
    },

    _parseTime(timeStr) {
        if (!timeStr) return null;
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
    },

    _calculateDelay(scheduled, expected) {
        if (!scheduled || !expected) return 0;
        return Math.round((expected - scheduled) / 60000); // milliseconds to minutes
    },

    _minutesUntil(targetTime, fromTime) {
        if (!targetTime) return Infinity;
        return Math.round((targetTime - fromTime) / 60000);
    },

    /**
     * Fetch detailed train progress (station-by-station) for proximity calculation
     * @param {string} trainNumber - Train number
     * @param {string} targetStationCode - Station we are interested in (e.g., 'BGM')
     */
    async fetchTrainProgress(trainNumber, targetStationCode) {
        const apiKey = this.API_KEY || CONFIG.RAILRADAR_API_KEY || localStorage.getItem('railradar_api_key');

        if (!apiKey) return null;

        const url = `${this.RAILRADAR_API}/trains/${trainNumber}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'X-API-Key': apiKey
                }
            });

            if (!response.ok) return null;

            const data = await response.json();

            if (!data.success || !data.data) return null;

            const liveData = data.data.liveData;
            const staticData = data.data.staticData;
            const route = liveData?.route || [];

            // Find target station in route
            const targetIdx = route.findIndex(s => s.stationCode === targetStationCode);
            if (targetIdx === -1) return null;

            const targetStation = route[targetIdx];

            // Find last station where train has departed
            let lastDepartedIdx = -1;
            for (let i = route.length - 1; i >= 0; i--) {
                if (route[i].actualDeparture) {
                    lastDepartedIdx = i;
                    break;
                }
            }

            // Calculate stations away and ETA
            const stationsAway = targetIdx - lastDepartedIdx;
            const isApproaching = lastDepartedIdx >= 0 && stationsAway > 0;
            const hasReached = targetStation.actualArrival !== undefined;
            const hasPassed = targetStation.actualDeparture !== undefined;

            // Get train type for speed estimation
            const trainType = staticData?.trainType || 'UNKNOWN';

            // ETA calculation (from scheduled times with delay adjustment)
            const now = Date.now() / 1000; // Unix timestamp
            const scheduledArrival = targetStation.scheduledArrival;
            const delayMinutes = targetStation.delayArrivalMinutes || liveData?.overallDelayMinutes || 0;
            const expectedArrival = scheduledArrival + (delayMinutes * 60);
            const minutesUntilArrival = Math.round((expectedArrival - now) / 60);

            return {
                trainNumber,
                trainName: staticData?.trainName,
                trainType,
                targetStation: targetStationCode,
                stationsAway,
                isApproaching,
                hasReached,
                hasPassed,
                lastDepartedStation: lastDepartedIdx >= 0 ? route[lastDepartedIdx].stationCode : null,
                minutesUntilArrival,
                delayMinutes,
                // For gate closure calculation
                closureThreshold: this._getClosureThreshold(trainType)
            };

        } catch (error) {
            console.warn('Train progress fetch failed:', error.message);

            // Fallback to NTES if available
            if (typeof NTESService !== 'undefined') {
                console.log('⚠️ RailRadar failed, trying NTES fallback...');
                try {
                    const ntesData = await NTESService.getTrainProgressForStation(trainNumber, targetStationCode);
                    if (ntesData) {
                        console.log('✅ Got data from NTES fallback');
                        return ntesData;
                    }
                } catch (ntesError) {
                    console.warn('NTES fallback also failed:', ntesError.message);
                }
            }

            return null;
        }
    },

    /**
     * Get gate closure threshold based on train type
     * Express trains need earlier closure (they don't slow down as much)
     */
    _getClosureThreshold(trainType) {
        const thresholds = {
            'RAJ': 15,    // Rajdhani - Fast express
            'SF': 12,     // Superfast Express
            'EXP': 10,    // Regular Express
            'MEX': 10,    // Mail Express
            'PAS': 6,     // Passenger - Slow, stops at all stations
            'MEMU': 5,    // Local
            'DMU': 5,     // Diesel Multiple Unit
            'UNKNOWN': 8
        };
        return thresholds[trainType] || 8;
    },

    async fetchSchedulesForStation(station) {
        console.log(`ℹ️ No static schedules for ${station.code} (using Rail Radar only)`);
        return [];
    }
};

window.TrainService = TrainService;
