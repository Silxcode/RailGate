/**
 * Core Algorithm Service: Predicts gate status based on train schedules, delays, and real-time reports
 * Data Sources: Rail Radar API + Crowdsourcing + Static Schedules
 */
const StatusPredictor = {
    // Time windows for data freshness
    TIME_WINDOWS: {
        GATE_REPORTS: 10 * 60 * 1000,    // 10 minutes
        TRAIN_DELAYS: 15 * 60 * 1000,    // 15 minutes
        CRITICAL_FRESH: 3 * 60 * 1000    // 3 minutes = "very fresh"
    },

    /**
     * Predicts status for a given gate
     * @param {Object} gate - Gate object with id, lat, lng, name
     * @param {Array} trains - Array of train schedules
     * @param {Array} crowdReports - Crowdsourced gate status reports
     * @param {Object} trainDelays - Map of train number to delay info {trainNumber: {delayMinutes, source}}
     */
    predict(gate, trains, crowdReports = [], trainDelays = {}) {
        const now = new Date();
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

        // 1. Check for recent Crowdsourced gate reports with consensus (Priority 1)
        const consensus = this.getConsensusGateStatus(gate.id, crowdReports, now);

        if (consensus && consensus.confidence > 0.7) {
            const age = now - consensus.latestTimestamp;
            const ageText = this.formatAge(age);

            return {
                status: consensus.status,
                confidence: consensus.confidence,
                source: 'crowdsource',
                message: `${consensus.reportCount} user${consensus.reportCount > 1 ? 's' : ''} reported ${consensus.status.toUpperCase()} (${ageText})`,
                dataSource: '👥 User Report',
                quality: {
                    reportCount: consensus.reportCount,
                    latestUpdate: ageText,
                    agreement: consensus.confidence > 0.85 ? 'strong' : 'moderate'
                }
            };
        }

        // 2. Predict based on train schedules + real-time delays (Priority 2)
        const nearbyTrains = trains.map(t => {
            const scheduledTime = this.timeToMinutes(t.arrivalAtBGM);
            const delay = trainDelays[t.number] || { delayMinutes: 0, source: 'schedule' };
            const adjustedTime = scheduledTime + delay.delayMinutes;

            return {
                ...t,
                scheduledTime,
                delayMinutes: delay.delayMinutes,
                delaySource: delay.source,
                adjustedTime,
                diff: adjustedTime - currentTimeInMinutes
            };
        }).filter(t => Math.abs(t.diff) <= 20); // Window: 20 mins before/after

        // Sort by adjusted arrival time
        nearbyTrains.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));

        if (nearbyTrains.length > 0) {
            const nearest = nearbyTrains[0];
            const diff = nearest.diff;
            const delayText = nearest.delayMinutes > 0 ? ` (delayed ${nearest.delayMinutes} min)` : '';
            const sourceIcon = nearest.delaySource === 'railradar' ? '🛰️' :
                nearest.delaySource === 'crowdsource' ? '👥' : '📅';

            if (diff >= -2 && diff <= 5) {
                return {
                    status: 'closed',
                    confidence: 0.85,
                    source: nearest.delaySource,
                    message: `Train ${nearest.name} expected now${delayText}`,
                    dataSource: `${sourceIcon} ${nearest.delaySource === 'railradar' ? 'Rail Radar' :
                        nearest.delaySource === 'crowdsource' ? 'User Report' : 'Schedule'}`
                };
            } else if (diff > 5 && diff <= 15) {
                return {
                    status: 'warning',
                    confidence: 0.7,
                    source: nearest.delaySource,
                    message: `Train ${nearest.name} arriving in ${diff} min${delayText}`,
                    dataSource: `${sourceIcon} ${nearest.delaySource === 'railradar' ? 'Rail Radar' :
                        nearest.delaySource === 'crowdsource' ? 'User Report' : 'Schedule'}`
                };
            }
        }

        return {
            status: 'open',
            confidence: 0.7,
            source: 'schedule',
            message: 'No trains scheduled in the next 15 minutes',
            dataSource: '📅 Schedule'
        };
    },

    /**
     * Fetch delays for all scheduled trains
     * Returns a map: { trainNumber: { delayMinutes, source } }
     * OPTIMIZED: Only fetches trains arriving within 30 minutes
     */
    async fetchTrainDelays(trains) {
        const delays = {};
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Filter trains: only check those arriving within 30 minutes
        const nearbyTrains = trains.filter(t => {
            const trainTime = this.timeToMinutes(t.arrivalAtBGM);
            const diff = trainTime - currentMinutes;
            return diff >= -10 && diff <= 30; // 10 min before to 30 min after
        });

        console.log(`🔍 Checking ${nearbyTrains.length}/${trains.length} trains (only nearby arrivals)`);

        // Check localStorage cache first (30 min TTL)
        const cachedDelays = this.loadDelaysFromCache();

        for (const train of nearbyTrains) {
            // Use cache if available and fresh
            if (cachedDelays[train.number]) {
                delays[train.number] = cachedDelays[train.number];
                continue;
            }

            try {
                const status = await TrainService.getLiveStatus(train.number);
                if (status && status.isDelayed) {
                    delays[train.number] = {
                        delayMinutes: status.delayMinutes,
                        source: status.source,
                        cachedAt: Date.now()
                    };
                }
            } catch (err) {
                console.warn(`Failed to get delay for ${train.number}:`, err);
            }
        }

        // Save to cache
        this.saveDelaysToCache(delays);

        return delays;
    },

    /**
     * Cache delays in localStorage (30 min TTL)
     */
    loadDelaysFromCache() {
        try {
            const cached = localStorage.getItem('railgate_train_delays_cache');
            if (!cached) return {};

            const data = JSON.parse(cached);
            const now = Date.now();
            const TTL = 30 * 60 * 1000; // 30 minutes

            // Filter expired entries
            const fresh = {};
            for (const [trainNumber, delay] of Object.entries(data)) {
                if (now - delay.cachedAt < TTL) {
                    fresh[trainNumber] = delay;
                }
            }

            return fresh;
        } catch {
            return {};
        }
    },

    saveDelaysToCache(delays) {
        try {
            localStorage.setItem('railgate_train_delays_cache', JSON.stringify(delays));
        } catch (err) {
            console.warn('Failed to cache delays:', err);
        }
    },

    timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    },

    /**
     * Get consensus gate status from multiple reports with age-weighted voting
     */
    getConsensusGateStatus(gateId, reports, now) {
        const recentReports = reports.filter(r =>
            r.gateId === gateId &&
            (now - new Date(r.timestamp)) < this.TIME_WINDOWS.GATE_REPORTS
        );

        if (recentReports.length === 0) return null;

        // Count votes with age-based weighting
        const votes = { open: 0, closed: 0 };
        let totalWeight = 0;

        recentReports.forEach(r => {
            const age = now - new Date(r.timestamp);
            const weight = 1 - (age / this.TIME_WINDOWS.GATE_REPORTS); // Newer = higher weight

            votes[r.status] = (votes[r.status] || 0) + weight;
            totalWeight += weight;
        });

        // Determine consensus
        const openScore = votes.open / totalWeight;
        const closedScore = votes.closed / totalWeight;

        return {
            status: openScore > closedScore ? 'open' : 'closed',
            confidence: Math.max(openScore, closedScore), // 0.0 - 1.0
            reportCount: recentReports.length,
            latestTimestamp: new Date(Math.max(...recentReports.map(r => new Date(r.timestamp))))
        };
    },

    /**
     * Calculate confidence with age-based decay
     */
    calculateConfidence(dataAge, source) {
        const thresholds = {
            crowdsource: this.TIME_WINDOWS.GATE_REPORTS,
            railradar: this.TIME_WINDOWS.TRAIN_DELAYS,
            schedule: Infinity // Static data doesn't decay
        };

        const maxAge = thresholds[source] || Infinity;
        if (dataAge > maxAge) return 0;

        // Base confidence levels
        const baseConfidence = {
            crowdsource: 0.95,
            railradar: 0.85,
            schedule: 0.70
        }[source] || 0.50;

        // Linear decay: 1.0 at age=0, 0.0 at age=maxAge
        const decayFactor = 1 - (dataAge / maxAge);
        return baseConfidence * Math.max(0, decayFactor);
    },

    /**
     * Format age in human-readable format
     */
    formatAge(ageMs) {
        const minutes = Math.floor(ageMs / 60000);
        const seconds = Math.floor((ageMs % 60000) / 1000);

        if (minutes === 0) return `${seconds}s ago`;
        if (minutes === 1) return '1 min ago';
        return `${minutes} min ago`;
    }
};

window.StatusPredictor = StatusPredictor;
