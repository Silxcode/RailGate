/**
 * Enhanced Station-Centric Gate Status Prediction
 * Phase 5: Time-of-day, multiple trains, direction-aware, ML logging
 */
import { supabase } from './supabase.js';

const StatusPredictor = {
    // Time windows
    TIME_WINDOWS: {
        GATE_REPORTS: 10 * 60 * 1000,
        WARNING_BUFFER: 5
    },

    /**
     * Main prediction method with all enhancements
     */
    async predict(gate, stationCode, crowdReports = []) {
        const now = new Date();
        let prediction = null;

        // 1. PRIORITY 1: User reports
        const consensus = this.getConsensusGateStatus(gate.id, crowdReports, now);
        if (consensus && consensus.confidence > 0.7) {
            prediction = this._buildCrowdsourcePrediction(consensus, now);
        }

        // 2. PRIORITY 2: RailRadar with enhancements
        if (!prediction) {
            try {
                prediction = await this._predictFromRailRadar(gate, stationCode, now);
            } catch (error) {
                console.warn('RailRadar prediction failed:', error);
            }
        }

        // 3. PRIORITY 3: Static timetable fallback
        if (!prediction || prediction.status === 'unknown') {
            const fallback = await this._predictFromTimetable(stationCode, now);
            if (fallback) prediction = fallback;
        }

        // 4. Default: Unknown
        if (!prediction) {
            prediction = {
                status: 'unknown',
                confidence: 0.30,
                source: 'no_data',
                message: 'No train data available',
                dataSource: '❓ No Data',
                needsUserReport: true
            };
        }

        // Log prediction for ML training
        this._logPrediction(gate, stationCode, prediction, now);

        return prediction;
    },

    /**
     * RailRadar prediction with time-of-day and multiple trains
     */
    async _predictFromRailRadar(gate, stationCode, now) {
        const approachingTrains = await TrainService.fetchTrainsApproachingStation(stationCode);
        if (!approachingTrains || approachingTrains.length === 0) return null;

        // Time-of-day adjustment
        const timeAdjustment = this._getTimeAdjustment(now);

        // Check ALL approaching trains (not just first)
        for (const train of approachingTrains) {
            const progress = await TrainService.fetchTrainProgress(train.number, stationCode);
            if (!progress) continue;

            // Skip if direction doesn't match gate
            if (gate.direction && gate.direction !== 'both') {
                const trainDirection = this._getTrainDirection(progress);
                if (trainDirection !== gate.direction) continue;
            }

            // Get adjusted closure threshold
            const baseThreshold = progress.closureThreshold || 10;
            const closureThreshold = baseThreshold + timeAdjustment;
            const warningThreshold = closureThreshold + this.TIME_WINDOWS.WARNING_BUFFER;
            const minutesUntil = progress.minutesUntilArrival;

            // Train at station
            if (progress.hasReached && !progress.hasPassed) {
                return this._buildPrediction('closed', 0.95, 'railradar', train, progress,
                    `${this._trainTypeEmoji(progress.trainType)} ${train.name} at station now`);
            }

            // Gate should close
            if (progress.isApproaching && minutesUntil <= closureThreshold) {
                const delayText = progress.delayMinutes > 0 ? ` (${progress.delayMinutes} min late)` : '';
                return this._buildPrediction('closed', 0.90, 'railradar', train, progress,
                    `${this._trainTypeEmoji(progress.trainType)} ${train.name} arriving in ${minutesUntil} min${delayText}`);
            }

            // Warning zone
            if (progress.isApproaching && minutesUntil <= warningThreshold) {
                return this._buildPrediction('warning', 0.85, 'railradar', train, progress,
                    `${this._trainTypeEmoji(progress.trainType)} ${train.name} arriving in ${minutesUntil} min`);
            }
        }

        // Check for back-to-back trains
        if (approachingTrains.length >= 2) {
            const first = approachingTrains[0];
            const second = approachingTrains[1];
            const gap = second.minutesUntilArrival - first.minutesUntilArrival;

            if (gap < 15) {
                return {
                    status: 'warning',
                    confidence: 0.80,
                    source: 'railradar',
                    message: `2 trains: ${first.name} (${first.minutesUntilArrival}m) + ${second.name} (${second.minutesUntilArrival}m)`,
                    dataSource: '🛰️ Rail Radar',
                    trainInfo: { backToBack: true, gap }
                };
            }
        }

        // Gate is open (no immediate trains)
        const nextTrain = approachingTrains[0];
        return {
            status: 'open',
            confidence: 0.75,
            source: 'railradar',
            message: `Next train in ${nextTrain.minutesUntilArrival} min`,
            dataSource: '🛰️ Rail Radar'
        };
    },

    /**
     * Static timetable fallback
     */
    async _predictFromTimetable(stationCode, now) {
        try {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const today = dayNames[now.getDay()];
            const currentTime = now.toTimeString().slice(0, 5);

            // Get upcoming trains from static schedule
            const { data: schedules } = await supabase
                .from('station_schedules')
                .select('*')
                .eq('station_code', stationCode)
                .contains('days_of_week', [today])
                .gte('arrival_time', currentTime)
                .order('arrival_time')
                .limit(3);

            if (!schedules || schedules.length === 0) return null;

            const next = schedules[0];
            const [hours, mins] = next.arrival_time.split(':').map(Number);
            const arrivalTime = new Date(now);
            arrivalTime.setHours(hours, mins, 0, 0);
            const minutesUntil = Math.round((arrivalTime - now) / 60000);

            if (minutesUntil <= 0) return null;

            const threshold = this._getThresholdForType(next.train_type) + this._getTimeAdjustment(now);

            if (minutesUntil <= threshold) {
                return {
                    status: 'closed',
                    confidence: 0.65,
                    source: 'timetable',
                    message: `📅 ${next.train_name || next.train_number} scheduled in ${minutesUntil} min`,
                    dataSource: '📅 Timetable'
                };
            } else if (minutesUntil <= threshold + 10) {
                return {
                    status: 'warning',
                    confidence: 0.60,
                    source: 'timetable',
                    message: `📅 Train scheduled in ${minutesUntil} min`,
                    dataSource: '📅 Timetable'
                };
            }

            return {
                status: 'open',
                confidence: 0.55,
                source: 'timetable',
                message: `📅 Next train in ${minutesUntil} min`,
                dataSource: '📅 Timetable'
            };
        } catch (error) {
            console.warn('Timetable fallback failed:', error);
            return null;
        }
    },

    /**
     * Time-of-day adjustment
     */
    _getTimeAdjustment(now) {
        const hour = now.getHours();
        const day = now.getDay();
        let adjustment = 0;

        // Peak hours: close earlier
        if (hour >= 7 && hour < 10) adjustment += 3;   // Morning rush
        if (hour >= 17 && hour < 20) adjustment += 3;  // Evening rush

        // Night: close later (less traffic)
        if (hour >= 22 || hour < 6) adjustment -= 2;

        // Weekend: slightly later
        if (day === 0 || day === 6) adjustment -= 1;

        return adjustment;
    },

    /**
     * Get train direction (UP/DOWN)
     */
    _getTrainDirection(progress) {
        // UP = towards higher station sequence
        // This is simplified; real logic may need route analysis
        return progress.isApproaching ? 'up' : 'down';
    },

    /**
     * Log prediction for ML training
     */
    async _logPrediction(gate, stationCode, prediction, now) {
        try {
            const hour = now.getHours();
            const isPeak = (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20);

            await supabase.from('prediction_logs').insert({
                gate_id: gate.id,
                station_code: stationCode,
                predicted_status: prediction.status,
                confidence: prediction.confidence,
                data_source: prediction.source,
                train_number: prediction.trainInfo?.number,
                train_type: prediction.trainInfo?.type,
                minutes_until_arrival: prediction.trainInfo?.minutesUntil,
                hour_of_day: hour,
                day_of_week: now.getDay(),
                is_peak_hour: isPeak
            });
        } catch (error) {
            // Silently fail - logging shouldn't break predictions
            console.debug('Prediction logging failed:', error);
        }
    },

    /**
     * Update prediction log with actual status (called when user reports)
     */
    async verifyPrediction(gateId, actualStatus, userId) {
        try {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

            await supabase
                .from('prediction_logs')
                .update({
                    actual_status: actualStatus,
                    verified_at: new Date().toISOString(),
                    verified_by: userId
                })
                .eq('gate_id', gateId)
                .is('actual_status', null)
                .gte('predicted_at', fiveMinAgo);
        } catch (error) {
            console.debug('Prediction verification failed:', error);
        }
    },

    // Helper methods
    _buildCrowdsourcePrediction(consensus, now) {
        const age = now - consensus.latestTimestamp;
        return {
            status: consensus.status,
            confidence: consensus.confidence,
            source: 'crowdsource',
            message: `${consensus.reportCount} user${consensus.reportCount > 1 ? 's' : ''} reported ${consensus.status.toUpperCase()} (${this.formatAge(age)})`,
            dataSource: '👥 User Report',
            quality: {
                reportCount: consensus.reportCount,
                latestUpdate: this.formatAge(age),
                agreement: consensus.confidence > 0.85 ? 'strong' : 'moderate'
            }
        };
    },

    _buildPrediction(status, confidence, source, train, progress, message) {
        return {
            status,
            confidence,
            source,
            message,
            dataSource: '🛰️ Rail Radar (Live)',
            trainInfo: {
                number: train.number,
                name: train.name,
                type: progress.trainType,
                minutesUntil: progress.minutesUntilArrival,
                stationsAway: progress.stationsAway
            }
        };
    },

    _getThresholdForType(trainType) {
        const thresholds = {
            'RAJ': 15, 'SF': 12, 'EXP': 10, 'MEX': 10,
            'PAS': 6, 'MEMU': 5, 'DMU': 5
        };
        return thresholds[trainType] || 8;
    },

    _trainTypeEmoji(trainType) {
        const emojis = {
            'RAJ': '🚄', 'SF': '🚅', 'EXP': '🚃', 'MEX': '🚃',
            'PAS': '🚂', 'MEMU': '🚇', 'DMU': '🚇'
        };
        return emojis[trainType] || '🚆';
    },

    getConsensusGateStatus(gateId, reports, now) {
        const recentReports = reports.filter(r =>
            r.gateId === gateId &&
            (now - new Date(r.timestamp)) < this.TIME_WINDOWS.GATE_REPORTS
        );

        if (recentReports.length === 0) return null;

        const votes = { open: 0, closed: 0 };
        let totalWeight = 0;

        recentReports.forEach(r => {
            const age = now - new Date(r.timestamp);
            const weight = 1 - (age / this.TIME_WINDOWS.GATE_REPORTS);
            votes[r.status] = (votes[r.status] || 0) + weight;
            totalWeight += weight;
        });

        return {
            status: votes.open > votes.closed ? 'open' : 'closed',
            confidence: Math.max(votes.open, votes.closed) / totalWeight,
            reportCount: recentReports.length,
            latestTimestamp: new Date(Math.max(...recentReports.map(r => new Date(r.timestamp))))
        };
    },

    formatAge(ageMs) {
        const minutes = Math.floor(ageMs / 60000);
        if (minutes === 0) return 'just now';
        if (minutes === 1) return '1 min ago';
        return `${minutes} min ago`;
    }
};

window.StatusPredictor = StatusPredictor;
