/**
 * NTES (National Train Enquiry System) Scraping Service
 * Fallback data source for train running status
 * Rate limited to 5-minute intervals for respectful scraping
 */

const NTESService = {
    BASE_URL: 'https://enquiry.indianrail.gov.in/mntes',
    _cache: {},
    _cacheTTL: 5 * 60 * 1000, // 5 minutes
    _lastFetchTime: {},

    /**
     * Fetch train running status from NTES
     * First checks zone cache, then fetches if needed
     * @param {string} trainNumber - Train number to fetch
     * @returns {Object|null} Train status data or null if unavailable
     */
    async getTrainStatus(trainNumber) {
        // PRIORITY 1: Check zone cache first (from rotating scraper)
        if (typeof ZoneScraper !== 'undefined') {
            const cachedTrain = ZoneScraper.getTrainFromCache(trainNumber);
            if (cachedTrain && cachedTrain.cacheAge < 20) { // FIX: 80min → 20min
                console.log(`✅ Using zone cache for train ${trainNumber} (age: ${cachedTrain.cacheAge} min)`);
                return cachedTrain;
            }
        }

        // PRIORITY 2: Check local cache
        const cached = this._getCache(trainNumber);
        if (cached) return cached;

        // Rate limiting: ensure 5 minutes between requests for same train
        const lastFetch = this._lastFetchTime[trainNumber];
        if (lastFetch && (Date.now() - lastFetch) < this._cacheTTL) {
            console.log(`⏳ NTES rate limit: waiting ${Math.round((this._cacheTTL - (Date.now() - lastFetch)) / 1000)}s`);
            return null;
        }

        try {
            console.log(`🌐 Fetching from NTES: ${trainNumber} (as regular user)`);
            this._lastFetchTime[trainNumber] = Date.now();

            // Add small random delay to mimic human behavior (500ms-2s)
            const humanDelay = 500 + Math.random() * 1500;
            await new Promise(resolve => setTimeout(resolve, humanDelay));

            // NTES API endpoint for train running status
            const url = `${this.BASE_URL}/api/train/running-status`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
                    'User-Agent': this._getRandomUserAgent(),
                    'Referer': 'https://enquiry.indianrail.gov.in/mntes/',
                    'Origin': 'https://enquiry.indianrail.gov.in',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                },
                body: JSON.stringify({
                    trainNo: trainNumber,
                    startDate: this._getDateString()
                })
            });

            if (!response.ok) {
                throw new Error(`NTES returned ${response.status}`);
            }

            const data = await response.json();
            const parsed = this._parseNTESResponse(data, trainNumber);

            if (parsed) {
                this._setCache(trainNumber, parsed);
            }

            return parsed;

        } catch (error) {
            console.warn('NTES fetch failed:', error.message);
            return null;
        }
    },

    /**
     * Parse NTES API response
     */
    _parseNTESResponse(data, trainNumber) {
        if (!data || !data.success) {
            return null;
        }

        const trainData = data.data;
        if (!trainData || !trainData.route) {
            return null;
        }

        // Find current position
        let currentStationCode = null;
        let currentStationName = null;
        let overallDelayMinutes = 0;

        for (const station of trainData.route) {
            if (station.actualArrival && !station.actualDeparture) {
                // Train is currently at this station
                currentStationCode = station.stationCode;
                currentStationName = station.stationName;
                overallDelayMinutes = station.delayMinutes || 0;
                break;
            } else if (station.actualDeparture) {
                // Train has departed, update current position
                currentStationCode = station.stationCode;
                currentStationName = station.stationName;
                overallDelayMinutes = station.delayMinutes || 0;
            }
        }

        return {
            trainNumber,
            trainName: trainData.trainName,
            currentStation: currentStationCode,
            currentStationName: currentStationName,
            delayMinutes: overallDelayMinutes,
            isDelayed: overallDelayMinutes > 0,
            route: trainData.route,
            source: 'ntes',
            lastUpdate: new Date(),
            dataSource: 'NTES'
        };
    },

    /**
     * Get train position for a specific station
     * @param {string} trainNumber - Train number
     * @param {string} targetStationCode - Station code to check
     * @returns {Object|null} Position data relative to target station
     */
    async getTrainProgressForStation(trainNumber, targetStationCode) {
        const status = await this.getTrainStatus(trainNumber);
        if (!status || !status.route) return null;

        const route = status.route;
        const targetIdx = route.findIndex(s => s.stationCode === targetStationCode);

        if (targetIdx === -1) {
            console.warn(`Station ${targetStationCode} not found in route for train ${trainNumber}`);
            return null;
        }

        const targetStation = route[targetIdx];

        // Find last departed station
        let lastDepartedIdx = -1;
        for (let i = route.length - 1; i >= 0; i--) {
            if (route[i].actualDeparture) {
                lastDepartedIdx = i;
                break;
            }
        }

        const stationsAway = targetIdx - lastDepartedIdx;
        const isApproaching = lastDepartedIdx >= 0 && stationsAway > 0;
        const hasReached = targetStation.actualArrival !== undefined;
        const hasPassed = targetStation.actualDeparture !== undefined;

        // Calculate ETA with actual timestamps
        const now = Date.now() / 1000;
        const scheduledArrival = this._parseTime(targetStation.scheduledArrival);
        const delayMinutes = targetStation.delayMinutes || status.delayMinutes || 0;
        const expectedArrival = scheduledArrival + (delayMinutes * 60);
        const minutesUntilArrival = Math.round((expectedArrival - now) / 60);

        // FIX: Calculate actual dwell time from timestamps
        let dwellMinutes = 0;
        if (hasReached && !hasPassed && targetStation.actualArrival) {
            const arrivalTimestamp = this._parseTime(targetStation.actualArrival);
            dwellMinutes = Math.round((now - arrivalTimestamp) / 60);
        }

        return {
            trainNumber,
            trainName: status.trainName,
            trainType: this._inferTrainType(trainNumber),
            targetStation: targetStationCode,
            stationsAway,
            isApproaching,
            hasReached,
            hasPassed,
            lastDepartedStation: lastDepartedIdx >= 0 ? route[lastDepartedIdx].stationCode : null,
            minutesUntilArrival,
            delayMinutes,
            dwellMinutes, // FIX: Add actual dwell time
            actualArrivalTime: targetStation.actualArrival,
            actualDepartureTime: targetStation.actualDeparture,
            source: 'ntes',
            closureThreshold: this._getClosureThreshold(this._inferTrainType(trainNumber))
        };
    },

    /**
     * Fetch live trains at a specific station
     * Real implementation using NTES running trains API
     */
    async fetchStationArrivals(stationCode, hoursAhead = 2) {
        try {
            // Add human-like delay
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

            const today = this._getDateString();
            const url = `${this.BASE_URL}/api/station/arrivals`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': this._getRandomUserAgent(),
                    'Referer': 'https://enquiry.indianrail.gov.in/mntes/',
                    'Origin': 'https://enquiry.indianrail.gov.in'
                },
                body: JSON.stringify({
                    stationCode: stationCode,
                    date: today,
                    hours: hoursAhead
                })
            });

            if (!response.ok) {
                throw new Error(`NTES station API returned ${response.status}`);
            }

            const data = await response.json();

            if (!data || !data.success || !data.trains) {
                console.warn(`No trains data for station ${stationCode}`);
                return [];
            }

            // Transform to app format
            return data.trains.map(train => ({
                number: train.trainNo,
                name: train.trainName,
                scheduledArrival: train.schArr,
                expectedArrival: train.expArr || train.schArr,
                delayMinutes: train.delayMinutes || 0,
                platform: train.platform || 'N/A',
                hasArrived: train.hasArrived || false,
                hasDeparted: train.hasDeparted || false,
                source: 'ntes'
            }));

        } catch (error) {
            console.warn(`NTES station arrivals failed for ${stationCode}:`, error.message);
            return [];
        }
    },

    /**
     * Infer train type from train number
     * Indian train numbers follow patterns:
     * 12xxx, 22xxx = Rajdhani/Shatabdi (Superfast)
     * 1xxxx = Superfast Express
     * 5xxxx = Passenger
     * 6xxxx = MEMU/DMU
     */
    _inferTrainType(trainNumber) {
        const num = parseInt(trainNumber);
        if (trainNumber.startsWith('12') || trainNumber.startsWith('22')) return 'RAJ';
        if (trainNumber.startsWith('1')) return 'SF';
        if (trainNumber.startsWith('5')) return 'PAS';
        if (trainNumber.startsWith('6')) return 'MEMU';
        return 'EXP';
    },

    _getClosureThreshold(trainType) {
        const thresholds = {
            'RAJ': 15, 'SF': 12, 'EXP': 10, 'MEX': 10,
            'PAS': 6, 'MEMU': 5, 'DMU': 5
        };
        return thresholds[trainType] || 8;
    },

    _parseTime(timeStr) {
        if (!timeStr) return null;
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return Math.floor(date.getTime() / 1000); // Unix timestamp
    },

    /**
     * Get random user-agent to mimic real users
     * Mix of mobile and desktop browsers from India
     */
    _getRandomUserAgent() {
        const userAgents = [
            // Android devices (most common in India)
            'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 12; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
            // Desktop browsers
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // iOS devices
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
        ];

        return userAgents[Math.floor(Math.random() * userAgents.length)];
    },

    _getDateString() {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    },

    _getCache(trainNumber) {
        const cached = this._cache[trainNumber];
        if (!cached) return null;

        const age = Date.now() - cached.cachedAt;
        if (age < this._cacheTTL) {
            console.log(`✅ Using cached NTES data for ${trainNumber} (age: ${Math.round(age / 1000)}s)`);
            return cached.data;
        }

        delete this._cache[trainNumber];
        return null;
    },

    _setCache(trainNumber, data) {
        this._cache[trainNumber] = {
            data,
            cachedAt: Date.now()
        };
        console.log(`💾 Cached NTES data for ${trainNumber}`);
    }
};

window.NTESService = NTESService;
