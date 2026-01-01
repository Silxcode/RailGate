import { supabase } from './supabase.js';

const CrowdService = {
    user: null, // Supabase user
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
        } else {
            console.log(`(Mock) Report for OSM gate ${gateName} saved locally`);
        }

        // Gamification (Local for now)
        this.updateUserStats(10);
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

    // Legacy/Stub methods
    submitClosureDuration() { /* ... */ },
    getRecentReports() { return []; },
    submitDelayReport() { /* ... */ }
};

window.CrowdService = CrowdService;
