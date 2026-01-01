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
            console.log('👤 Signing in anonymously...');
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) console.error('Auth error:', error);
            else this.user = data.user;
        }

        console.log('🆔 CrowdService active for user:', this.user?.id);
    },

    /**
     * Submit a gate status report
     */
    async submitReport(gateId, gateName, status) {
        if (!this.user) await this.init();

        const report = {
            gate_id: gateId, // UUID if crowdsourced, but might be string for OSM?
            // Note: If gateId is OSM ID (string), this FK constraint will fail.
            // We need to handle OSM gates differently or store them in 'gates' table first?
            // For now, let's assume we store OSM ID as string in a separate column or just log it.
            // My Schema has `gate_id uuid references gates(id)`. This only works for Supabase gates.
            // WORKAROUND: For OSM gates, we might need a separate table or just log to a 'reports' table that accepts external IDs.
            // Let's modify the schema or just log to console for OSM gates for now.
            status: status,
            user_id: this.user?.id
        };

        // If it's a UUID (Supabase gate), save to DB
        // If it's OSM (string like 'osm_123'), we can't save to 'gate_reports' (uuid)
        // unless we dynamically create a gate record for it.

        const isSupabaseGate = gateId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        if (isSupabaseGate) {
            const { error } = await supabase.from('gate_reports').insert(report);
            if (error) console.error('Error submitting report:', error);
            else console.log(`✅ Report saved to DB for ${gateName}`);
        } else {
            console.log(`📝 (Mock) Report for OSM gate ${gateName} saved locally`);
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
        console.log(`📍 Gate submitted to DB: ${name}`);
        this.showThankYouNotification(name, 'submitted');

        return data; // Returns the full object with ID
    },

    updateUserStats(points) {
        this.userStats.points += points;
        // In future: Sync points to 'profiles' table
        // await supabase.from('profiles').update({ points: this.userStats.points }).eq('id', this.user.id);
        const pointsEl = document.getElementById('user-points');
        if (pointsEl) pointsEl.textContent = this.userStats.points;
    },

    showThankYouNotification(name, action) {
        // Reuse existing notification logic or simple alert
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


/**
 * Submit a train delay report (crowdsourcing)
 */
submitDelayReport(report) {
    this.delayReports.push(report);
    this.updateUserStats(20); // 20 points for delay reports
    this.saveDelayReports();

    console.log(`🚂 Delay reported for train ${report.trainNumber}: ${report.delayMinutes} min`);
    this.showDelayThankYou(report);

    return report;
},

/**
 * Get delay reports for a specific train
 */
getDelayReports(trainNumber) {
    this.loadDelayReports();
    return this.delayReports.filter(r => r.trainNumber === trainNumber);
},

/**
 * Save/Load delay reports to localStorage
 */
saveDelayReports() {
    localStorage.setItem('railgate_delay_reports', JSON.stringify(this.delayReports));
},

loadDelayReports() {
    const str = localStorage.getItem('railgate_delay_reports');
    if (str) this.delayReports = JSON.parse(str);
},

showDelayThankYou(report) {
    const overlay = document.getElementById('voice-overlay');
    const textEl = document.getElementById('voice-text');
    if (overlay && textEl) {
        textEl.innerHTML = `🚂 Thanks!<br><small>Train ${report.trainNumber} delay reported</small>`;
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('hidden'), 2000);
    }
},

/**
 * Update user statistics and check for achievements
 */
updateUserStats(points) {
    this.userStats.totalReports++;
    this.userStats.points += points;

    // Check streak
    const today = new Date().toDateString();
    const lastReport = this.userStats.lastReportDate;

    if (lastReport === today) {
        // Same day, no change to streak
    } else {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (lastReport === yesterday) {
            this.userStats.streak++;
        } else {
            this.userStats.streak = 1; // Reset streak
        }
    }

    this.userStats.lastReportDate = today;
    this.checkBadges();
    this.saveToLocal();
},

/**
 * Check and award badges
 */
checkBadges() {
    const badges = [];

    if (this.userStats.totalReports >= 1 && !this.hasBadge('first-report')) {
        badges.push({ id: 'first-report', name: '🎉 First Report', desc: 'Made your first contribution' });
    }

    if (this.userStats.totalReports >= 10 && !this.hasBadge('contributor')) {
        badges.push({ id: 'contributor', name: '⭐ Contributor', desc: '10 reports submitted' });
    }

    if (this.userStats.totalReports >= 50 && !this.hasBadge('champion')) {
        badges.push({ id: 'champion', name: '🏆 Champion', desc: '50 reports submitted' });
    }

    if (this.userStats.streak >= 7 && !this.hasBadge('week-streak')) {
        badges.push({ id: 'week-streak', name: '🔥 Week Streak', desc: '7 days in a row' });
    }

    badges.forEach(badge => {
        this.userStats.badges.push(badge);
        this.showBadgeNotification(badge);
    });
},

hasBadge(badgeId) {
    return this.userStats.badges.some(b => b.id === badgeId);
},

getUserStats() {
    return this.userStats;
},

getUserId() {
    let userId = localStorage.getItem('railgate_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('railgate_user_id', userId);
    }
    return userId;
},

showThankYouNotification(gateName, status) {
    const overlay = document.getElementById('voice-overlay');
    const textEl = document.getElementById('voice-text');

    if (overlay && textEl) {
        textEl.innerHTML = `✅ Thank you!<br><small>Status updated for ${gateName}</small>`;
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('hidden'), 2000);
    }
},

showBadgeNotification(badge) {
    const overlay = document.getElementById('voice-overlay');
    const textEl = document.getElementById('voice-text');

    if (overlay && textEl) {
        textEl.innerHTML = `${badge.name}<br><small>${badge.desc}</small>`;
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('hidden'), 3000);
    }
},

saveToLocal() {
    localStorage.setItem('railgate_crowd_reports', JSON.stringify(this.reports));
    localStorage.setItem('railgate_user_stats', JSON.stringify(this.userStats));
},

loadFromLocal() {
    const reportsStr = localStorage.getItem('railgate_crowd_reports');
    const statsStr = localStorage.getItem('railgate_user_stats');

    if (reportsStr) this.reports = JSON.parse(reportsStr);
    if (statsStr) this.userStats = JSON.parse(statsStr);
},

saveNewGate(gate) {
    let gates = JSON.parse(localStorage.getItem('railgate_user_gates') || '[]');
    gates.push(gate);
    localStorage.setItem('railgate_user_gates', JSON.stringify(gates));
},

getUserGates() {
    return JSON.parse(localStorage.getItem('railgate_user_gates') || '[]');
},


// Crowdsourced Gate Discovery with Voting
pendingGates: [],
    approvedGates: [],

        submitNewGate(lat, lng, name, stationCode) {
    const userId = this.getUserId();
    const newGate = {
        id: `pending_${Date.now()}`,
        name, lat, lng, stationCode,
        submittedBy: userId,
        submittedAt: new Date().toISOString(),
        votes: [userId],
        voteCount: 1,
        status: 'pending'
    };

    this.pendingGates.push(newGate);
    this.updateUserStats(50);
    this.savePendingGates();

    console.log(`📍 New gate submitted: ${name} (1/3 votes)`);
    return newGate;
},

voteForGate(gateId) {
    const userId = this.getUserId();
    const gate = this.pendingGates.find(g => g.id === gateId);
    if (!gate || gate.votes.includes(userId)) return false;

    gate.votes.push(userId);
    gate.voteCount++;
    this.updateUserStats(10);

    if (gate.voteCount >= 3) this.approveGate(gate);

    this.savePendingGates();
    return true;
},

approveGate(gate) {
    gate.status = 'approved';
    gate.approvedAt = new Date().toISOString();
    this.approvedGates.push(gate);
    this.pendingGates = this.pendingGates.filter(g => g.id !== gate.id);
    this.saveApprovedGates();
    this.savePendingGates();
    console.log(`🎉 Gate approved: ${gate.name}`);
    return gate;
},

getPendingGatesNearStation(stationCode) {
    this.loadPendingGates();
    return this.pendingGates.filter(g => g.stationCode === stationCode);
},

getApprovedGates(stationCode = null) {
    this.loadApprovedGates();
    return stationCode ? this.approvedGates.filter(g => g.stationCode === stationCode) : this.approvedGates;
},

savePendingGates() {
    localStorage.setItem('railgate_pending_gates', JSON.stringify(this.pendingGates));
},

loadPendingGates() {
    const str = localStorage.getItem('railgate_pending_gates');
    if (str) this.pendingGates = JSON.parse(str);
},

saveApprovedGates() {
    localStorage.setItem('railgate_approved_gates', JSON.stringify(this.approvedGates));
},

loadApprovedGates() {
    const str = localStorage.getItem('railgate_approved_gates');
    if (str) this.approvedGates = JSON.parse(str);
}
};

// Initialize
CrowdService.init();
window.CrowdService = CrowdService;
