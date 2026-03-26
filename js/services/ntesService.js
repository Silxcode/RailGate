/**
 * NTES (National Train Enquiry System) Service
 * "Human Mimicry" safe scraper with session warming,
 * circuit breaker, and Vite proxy routing.
 *
 * Data flow:
 *   Browser → /api/ntes/* (Vite Proxy) → enquiry.indianrail.gov.in/mntes/*
 *
 * Safety features:
 *   - Session warming (fetch landing page first for cookies)
 *   - Randomized jitter between requests (2-4s)
 *   - Global rate limit (1 req / 30s per client)
 *   - Per-train cache (5 min TTL)
 *   - Circuit breaker (1 hour cooldown on 403/429)
 */

const NTESService = {
    // In dev: Vite proxy rewrites /api/ntes → /mntes on the real server
    // In prod: replace with your own CORS proxy URL
    PROXY_URL: '/api/ntes',

    _cache: {},
    _cacheTTL: 5 * 60 * 1000,       // 5 min cache per train
    _lastFetchTime: {},
    _globalLastFetch: 0,
    _globalCooldownMs: 30 * 1000,    // 30s between ANY requests

    // Circuit breaker
    _circuitOpen: false,
    _circuitOpenedAt: 0,
    _circuitCooldownMs: 60 * 60 * 1000, // 1 hour

    // Session state
    _sessionReady: false,
    _sessionWarmingInProgress: false,

    /**
     * Warm the session: fetch the NTES landing page to get cookies (JSESSIONID).
     * Must be called before any data request. Only warms once per page load.
     */
    async _warmSession() {
        if (this._sessionReady || this._sessionWarmingInProgress) return;
        this._sessionWarmingInProgress = true;

        try {
            console.log('🔑 NTES: Warming session (fetching landing page)...');
            // Small human delay before first contact
            await this._humanDelay(1000, 2000);

            const res = await fetch(`${this.PROXY_URL}/`, {
                method: 'GET',
                headers: this._buildHeaders(),
                credentials: 'include'
            });

            if (res.ok) {
                this._sessionReady = true;
                console.log('✅ NTES: Session warmed (cookies acquired)');
            } else {
                console.warn(`⚠️ NTES session warm failed: ${res.status}`);
            }
        } catch (err) {
            console.warn('⚠️ NTES session warm error:', err.message);
        } finally {
            this._sessionWarmingInProgress = false;
        }
    },

    /**
     * Fetch train running status — the main entry point.
     */
    async getTrainStatus(trainNumber) {
        // PRIORITY 1: Zone cache (from rotating scraper)
        if (typeof ZoneScraper !== 'undefined') {
            const cachedTrain = ZoneScraper.getTrainFromCache(trainNumber);
            if (cachedTrain && cachedTrain.cacheAge < 20) {
                console.log(`✅ Using zone cache for train ${trainNumber} (age: ${cachedTrain.cacheAge} min)`);
                return cachedTrain;
            }
        }

        // PRIORITY 2: Local cache
        const cached = this._getCache(trainNumber);
        if (cached) return cached;

        // Check circuit breaker
        if (this._isCircuitOpen()) {
            console.log('🔴 NTES circuit breaker OPEN — skipping fetch');
            return null;
        }

        // Per-train rate limit (5 min)
        const lastFetch = this._lastFetchTime[trainNumber];
        if (lastFetch && (Date.now() - lastFetch) < this._cacheTTL) {
            console.log(`⏳ NTES rate limit: waiting ${Math.round((this._cacheTTL - (Date.now() - lastFetch)) / 1000)}s`);
            return null;
        }

        // Global rate limit (30s between any request)
        const sinceLast = Date.now() - this._globalLastFetch;
        if (sinceLast < this._globalCooldownMs) {
            console.log(`⏳ NTES global cooldown: ${Math.round((this._globalCooldownMs - sinceLast) / 1000)}s`);
            return null;
        }

        try {
            // Ensure session is warm
            await this._warmSession();

            console.log(`🌐 NTES: Fetching train ${trainNumber} (human-like)...`);
            this._lastFetchTime[trainNumber] = Date.now();
            this._globalLastFetch = Date.now();

            // Human-like delay before the actual data request
            await this._humanDelay(2000, 4000);

            const url = `${this.PROXY_URL}/api/train/running-status`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...this._buildHeaders(),
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    trainNo: trainNumber,
                    startDate: this._getDateString()
                })
            });

            // Circuit breaker: if blocked, go dark
            if (response.status === 403 || response.status === 429) {
                this._tripCircuit();
                return null;
            }

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
     * Fetch live trains arriving at a specific station
     */
    async fetchStationArrivals(stationCode, hoursAhead = 2) {
        // Check circuit breaker
        if (this._isCircuitOpen()) return [];

        // Global rate limit
        const sinceLast = Date.now() - this._globalLastFetch;
        if (sinceLast < this._globalCooldownMs) return [];

        try {
            await this._warmSession();

            await this._humanDelay(1500, 3000);
            this._globalLastFetch = Date.now();

            const url = `${this.PROXY_URL}/api/station/arrivals`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...this._buildHeaders(),
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    stationCode: stationCode,
                    date: this._getDateString(),
                    hours: hoursAhead
                })
            });

            if (response.status === 403 || response.status === 429) {
                this._tripCircuit();
                return [];
            }

            if (!response.ok) {
                throw new Error(`NTES station API returned ${response.status}`);
            }

            const data = await response.json();

            if (!data || !data.success || !data.trains) {
                console.warn(`No trains data for station ${stationCode}`);
                return [];
            }

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

    // ─── PARSING (unchanged, works correctly) ────────────────────────

    _parseNTESResponse(data, trainNumber) {
        if (!data || !data.success) return null;

        const trainData = data.data;
        if (!trainData || !trainData.route) return null;

        let currentStationCode = null;
        let currentStationName = null;
        let overallDelayMinutes = 0;

        for (const station of trainData.route) {
            if (station.actualArrival && !station.actualDeparture) {
                currentStationCode = station.stationCode;
                currentStationName = station.stationName;
                overallDelayMinutes = station.delayMinutes || 0;
                break;
            } else if (station.actualDeparture) {
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

        const now = Date.now() / 1000;
        const scheduledArrival = this._parseTime(targetStation.scheduledArrival);
        const delayMinutes = targetStation.delayMinutes || status.delayMinutes || 0;
        const expectedArrival = scheduledArrival + (delayMinutes * 60);
        const minutesUntilArrival = Math.round((expectedArrival - now) / 60);

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
            dwellMinutes,
            actualArrivalTime: targetStation.actualArrival,
            actualDepartureTime: targetStation.actualDeparture,
            source: 'ntes',
            closureThreshold: this._getClosureThreshold(this._inferTrainType(trainNumber))
        };
    },

    // ─── SAFETY MECHANISMS ───────────────────────────────────────────

    _tripCircuit() {
        this._circuitOpen = true;
        this._circuitOpenedAt = Date.now();
        console.error('🔴 NTES CIRCUIT BREAKER TRIPPED — going dark for 1 hour');
    },

    _isCircuitOpen() {
        if (!this._circuitOpen) return false;
        const elapsed = Date.now() - this._circuitOpenedAt;
        if (elapsed >= this._circuitCooldownMs) {
            this._circuitOpen = false;
            this._sessionReady = false; // Force re-warm
            console.log('🟢 NTES circuit breaker RESET — resuming');
            return false;
        }
        return true;
    },

    /**
     * Human-like delay with jitter
     * @param {number} minMs - Minimum delay in ms
     * @param {number} maxMs - Maximum delay in ms
     */
    _humanDelay(minMs, maxMs) {
        const delay = minMs + Math.random() * (maxMs - minMs);
        return new Promise(resolve => setTimeout(resolve, delay));
    },

    /**
     * Build realistic browser headers
     */
    _buildHeaders() {
        return {
            'Accept': 'application/json, text/html, */*;q=0.9',
            'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6',
            'User-Agent': this._getRandomUserAgent(),
            'DNT': '1',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-CH-UA-Mobile': '?1',
            'Sec-CH-UA-Platform': '"Android"'
        };
    },

    // ─── UTILITY ─────────────────────────────────────────────────────

    _inferTrainType(trainNumber) {
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
        return Math.floor(date.getTime() / 1000);
    },

    _getRandomUserAgent() {
        const ua = [
            'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1'
        ];
        return ua[Math.floor(Math.random() * ua.length)];
    },

    _getDateString() {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}-${mm}-${d.getFullYear()}`;
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
        this._cache[trainNumber] = { data, cachedAt: Date.now() };
        console.log(`💾 Cached NTES data for ${trainNumber}`);
    }
};

window.NTESService = NTESService;
