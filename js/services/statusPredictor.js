/**
 * Enhanced Station-Centric Gate Status Prediction
 * Phase 5: Time-of-day, multiple trains, direction-aware, ML logging
 */
import { supabase } from './supabase.js';

const StatusPredictor = {
    // Time windows
    TIME_WINDOWS: {
        GATE_REPORTS: 10 * 60 * 1000,
        WARNING_BUFFER: 5,
        POST_PASS_BUFFER_MS: 90 * 1000,  // 90s safety margin after train passes
        CLOSURE_LOCK_MS: 3 * 60 * 1000   // 3-min lock: don't flip to 'open' too fast
    },

    // Track last-closed timestamp per gate to prevent false-open flicker
    _lastClosedState: new Map(),

    /**
     * Main prediction method with all enhancements
     */
    async predict(gate, stationCode, crowdReports = []) {
        const now = new Date();
        let prediction = null;

        // 1. PRIORITY 1: Recent User reports (< 5 min) ALWAYS override
        const consensus = this.getConsensusGateStatus(gate.id, crowdReports, now);
        if (consensus) {
            const ageMinutes = Math.round((now - consensus.latestTimestamp) / 60000);

            // Very recent reports (< 5 min) ALWAYS take priority
            if (ageMinutes < 5) {
                prediction = this._buildCrowdsourcePrediction(consensus, now);
                prediction.confidence = Math.max(0.95, consensus.confidence); // Boost confidence
                prediction.overridesAPI = true;
                console.log(`👥 Using fresh crowd report (${ageMinutes} min old) - OVERRIDING API`);
                return prediction;
            }

            // Older reports (5-10 min) if high confidence
            if (consensus.confidence > 0.8) {
                prediction = this._buildCrowdsourcePrediction(consensus, now);
                console.log(`👥 Using crowd report (${ageMinutes} min old, high confidence)`);
            }
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
        if (!approachingTrains || approachingTrains.length === 0) {
            // PESSIMISTIC: Check if gate was recently closed — don't flip to open instantly
            return this._applyPostPassBuffer(gate, now, null);
        }

        const timeAdjustment = this._getTimeAdjustment(now);
        const tracks = typeof GateService !== 'undefined' ? GateService.railwayTracks : [];

        // Collect ALL closure/warning signals from ALL trains
        let closestClosed = null;
        let closestWarning = null;
        let anyTrainNearby = false;

        for (const train of approachingTrains) {
            const progress = await TrainService.fetchTrainProgress(train.number, stationCode);
            if (!progress) continue;

            const baseThreshold = progress.closureThreshold || 10;
            const closureThreshold = baseThreshold + timeAdjustment;
            const warningThreshold = closureThreshold + this.TIME_WINDOWS.WARNING_BUFFER;
            const minutesUntil = progress.minutesUntilArrival;
            const dwellMinutes = progress.dwellMinutes || 0;

            // --- TRACK-VECTOR ANALYSIS ---
            // If we have track geometry and GPSUtils, check if gate is in the train's path
            if (tracks.length > 0 && typeof GPSUtils !== 'undefined' && GPSUtils.isGateInTrainPath) {
                const inPath = GPSUtils.isGateInTrainPath(
                    gate, stationCode, progress, tracks
                );
                // If gate is NOT in this train's path, skip this train entirely
                if (inPath === false) {
                    console.log(`🛤️ Gate ${gate.name} NOT in path of ${train.name} — skipping`);
                    continue;
                }
            }

            anyTrainNearby = true;

            // CASE 1: Train has PASSED the station — apply post-pass buffer
            if (progress.hasPassed) {
                // Record closed-end timestamp, gate stays closed for buffer period
                this._lastClosedState.set(gate.id, { timestamp: now.getTime(), train: train.name });
                continue; // Check next train
            }

            // CASE 2: Train AT platform (arrived but not departed)
            if (progress.hasReached && !progress.hasPassed) {
                // Gate is CLOSED while train is at platform (pessimistic)
                // Only mark open if dwellMinutes is high and no other train is near
                if (dwellMinutes >= 3) {
                    // Long dwell: likely stopped, but keep warning
                    if (!closestWarning || minutesUntil < closestWarning.minutesUntil) {
                        closestWarning = {
                            train, progress, minutesUntil,
                            message: `⚠️ ${train.name} at platform (${dwellMinutes} min dwell)`
                        };
                    }
                } else {
                    // Recently arrived — gate is definitely closed
                    closestClosed = {
                        train, progress, minutesUntil,
                        message: `${this._trainTypeEmoji(progress.trainType)} ${train.name} at station`
                    };
                    this._lastClosedState.set(gate.id, { timestamp: now.getTime(), train: train.name });
                }
                continue;
            }

            // CASE 3: Train APPROACHING — within closure threshold
            if (progress.isApproaching && minutesUntil <= closureThreshold) {
                const delayText = progress.delayMinutes > 0 ? ` (${progress.delayMinutes} min late)` : '';
                if (!closestClosed || minutesUntil < closestClosed.minutesUntil) {
                    closestClosed = {
                        train, progress, minutesUntil,
                        message: `${this._trainTypeEmoji(progress.trainType)} ${train.name} arriving in ${minutesUntil} min${delayText}`
                    };
                }
                this._lastClosedState.set(gate.id, { timestamp: now.getTime(), train: train.name });
                continue;
            }

            // CASE 4: Train APPROACHING — within warning threshold
            if (progress.isApproaching && minutesUntil <= warningThreshold) {
                if (!closestWarning || minutesUntil < closestWarning.minutesUntil) {
                    closestWarning = {
                        train, progress, minutesUntil,
                        message: `${this._trainTypeEmoji(progress.trainType)} ${train.name} arriving in ${minutesUntil} min`
                    };
                }
                continue;
            }
        }

        // --- DECISION PRIORITY ---

        // 1. Any train causing closure → CLOSED (back-to-back lock: stays closed for ALL)
        if (closestClosed) {
            return this._buildPrediction('closed', 0.92, 'railradar',
                closestClosed.train, closestClosed.progress, closestClosed.message);
        }

        // 2. Any train in warning zone → WARNING
        if (closestWarning) {
            return this._buildPrediction('warning', 0.85, 'railradar',
                closestWarning.train, closestWarning.progress, closestWarning.message);
        }

        // 3. No immediate threat — but apply post-pass buffer before saying 'open'
        if (anyTrainNearby || approachingTrains.length > 0) {
            const bufferResult = this._applyPostPassBuffer(gate, now, approachingTrains[0]);
            if (bufferResult) return bufferResult;
        }

        // 4. Genuinely open
        const nextTrain = approachingTrains[0];
        return {
            status: 'open',
            confidence: 0.70,
            source: 'railradar',
            message: `Next train in ${nextTrain.minutesUntilArrival} min`,
            dataSource: '🛰️ Rail Radar'
        };
    },

    /**
     * Post-pass safety buffer: prevents flipping to 'open' too quickly
     * after a train has just passed or the gate was recently marked closed.
     */
    _applyPostPassBuffer(gate, now, nextTrain) {
        const lastClosed = this._lastClosedState.get(gate.id);
        if (!lastClosed) return null;

        const elapsed = now.getTime() - lastClosed.timestamp;

        // Within 90-second hard buffer → stay CLOSED
        if (elapsed < this.TIME_WINDOWS.POST_PASS_BUFFER_MS) {
            const remainSec = Math.round((this.TIME_WINDOWS.POST_PASS_BUFFER_MS - elapsed) / 1000);
            return {
                status: 'closed',
                confidence: 0.85,
                source: 'railradar',
                message: `🔒 Gate clearing — wait ~${remainSec}s (${lastClosed.train})`,
                dataSource: '🛰️ Rail Radar (Buffer)'
            };
        }

        // Within 3-minute soft lock → show WARNING (not open)
        if (elapsed < this.TIME_WINDOWS.CLOSURE_LOCK_MS) {
            return {
                status: 'warning',
                confidence: 0.70,
                source: 'railradar',
                message: `⚠️ Gate may still be clearing (${lastClosed.train} just passed)`,
                dataSource: '🛰️ Rail Radar (Buffer)'
            };
        }

        // Beyond lock period, clear the state
        this._lastClosedState.delete(gate.id);
        return null;
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
        // Derive direction from station sequence in route data
        if (progress.lastDepartedStation && progress.targetStation) {
            // If last departed comes before target in alphabetical/code order → UP direction
            return progress.lastDepartedStation < progress.targetStation ? 'up' : 'down';
        }
        return progress.isApproaching ? 'up' : 'down';
    },

    /**
     * Log prediction for ML training
     */
    async _logPrediction(gate, stationCode, prediction, now) {
        try {
            const hour = now.getHours();
            const isPeak = (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20);

            // Ensure status is lowercase to match DB constraint ('open', 'closed', etc.)
            const status = (prediction.status || 'unknown').toLowerCase();

            const { error } = await supabase.from('prediction_logs').insert({
                gate_id: gate.id,
                station_code: stationCode,
                predicted_status: status,
                confidence: prediction.confidence,
                data_source: prediction.source,
                train_number: prediction.trainInfo?.number || null,
                train_name: prediction.trainInfo?.name || null,
                train_type: prediction.trainInfo?.type || null,
                minutes_until_arrival: prediction.trainInfo?.minutesUntil || null,
                hour_of_day: hour,
                day_of_week: now.getDay(),
                is_peak_hour: isPeak
            });
            
            if (error) throw error;
        } catch (error) {
            // Silently fail - logging shouldn't break predictions
            console.debug('Prediction logging failed:', error.message || error);
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
