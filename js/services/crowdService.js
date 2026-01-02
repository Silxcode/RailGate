import { supabase } from './supabase.js';

const CrowdService = {
    user: null, // Supabase user
    delayReports: [], // Local storage for delay reports
    userStats: {
        totalReports: 0,
        points: 0, // In future, fetch from 'profiles'
        level: 1
    },

    async init() {
        // Check for existing session or sign in anonymously
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            this.user = session.user;
        } else {
            console.log('Signing in anonymously...');
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) console.error('Auth error:', error);
            else this.user = data.user;
        }

        console.log('CrowdService active for user:', this.user?.id);
    },

    /**
     * Submit a gate status report
     */
    async submitReport(gateId, gateName, status) {
        if (!this.user) await this.init();

        const report = {
            gate_id: gateId, // UUID if crowdsourced, but might be string for OSM?
            status: status,
            user_id: this.user?.id
        };

        const isSupabaseGate = gateId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        if (isSupabaseGate) {
            const { error } = await supabase.from('gate_reports').insert(report);
            if (error) console.error('Error submitting report:', error);
            else console.log(`Report saved to DB for ${gateName}`);

            // Verify recent predictions for ML accuracy tracking
            if (typeof StatusPredictor !== 'undefined' && StatusPredictor.verifyPrediction) {
                StatusPredictor.verifyPrediction(gateId, status, this.user?.id);
            }
        } else {
            console.log(`(Mock) Report for OSM gate ${gateName} saved locally`);
        }

        // Gamification
        this.updateUserStats(10);
        await this.syncUserStatsToDb();
        this.showThankYouNotification(gateName, status);

        return report;
    },

    /**
     * Submit a new gate location
     */
    async submitNewGate(lat, lng, name, stationCode) {
        if (!this.user) await this.init();

        const newGate = {
            name: name,
            lat: lat,
            lng: lng,
            station_code: stationCode,
            created_by: this.user?.id,
            status: 'pending'
        };

        const { data, error } = await supabase
            .from('gates')
            .insert(newGate)
            .select()
            .single();

        if (error) {
            console.error('Error submitting gate:', error);
            alert('Failed to submit gate. Please try again.');
            return null;
        }

        this.updateUserStats(50);
        console.log(`Gate submitted to DB: ${name}`);
        this.showThankYouNotification(name, 'submitted');

        return data; // Returns the full object with ID
    },

    updateUserStats(points) {
        this.userStats.points += points;
        const pointsEl = document.getElementById('user-points');
        if (pointsEl) pointsEl.textContent = this.userStats.points;
    },

    showThankYouNotification(name, action) {
        const msg = action === 'submitted'
            ? `Thanks! ${name} submitted for review.`
            : `Thanks! Report for ${name} recorded.`;

        // Simple toast
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-gray-800 text-white px-6 py-3 rounded shadow-lg z-50 animate-bounce';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    getUserStats() {
        return this.userStats;
    },

    // Legacy/Stub methods
    submitClosureDuration() { /* ... */ },
    getRecentReports() { return []; },

    /**
     * Submit a train delay report (Quick-select UX)
     */
    async submitDelayReport(report) {
        if (!this.user) await this.init();

        const delayData = {
            gate_id: report.gateId,
            station_code: report.stationCode,
            delay_bucket: report.delayBucket,
            train_number: report.trainNumber,
            reported_by: this.user?.id
        };

        const { error } = await supabase
            .from('train_delays')
            .insert(delayData);

        if (error) {
            console.error('Error submitting delay:', error);
        } else {
            console.log('✅ Delay report saved to DB');
        }

        // Update user stats
        this.updateUserStats(20);
        await this.syncUserStatsToDb();
        this.showThankYouNotification('Delay Report', 'submitted');
    },

    /**
     * Sync user stats to database
     */
    async syncUserStatsToDb() {
        if (!this.user) return;

        const { error } = await supabase
            .from('user_profiles')
            .upsert({
                user_id: this.user.id,
                points: this.userStats.points,
                level: this.userStats.level,
                total_reports: this.userStats.totalReports
            });

        if (error) console.warn('Failed to sync user stats:', error);
    }
};

window.CrowdService = CrowdService;
