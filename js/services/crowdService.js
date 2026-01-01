/**
 * Service to handle crowdsourced reports and gamification
 */
const CrowdService = {
    reports: [],
    userStats: {
        totalReports: 0,
        points: 0,
        streak: 0,
        lastReportDate: null,
        badges: []
    },

    init() {
        this.loadFromLocal();
    },

    /**
     * Submit a gate status report
     */
    submitReport(gateId, gateName, status) {
        const report = {
            gateId,
            gateName,
            status,
            timestamp: new Date().toISOString(),
            userId: this.getUserId()
        };

        this.reports.push(report);
        this.updateUserStats(10); // 10 points per report
        this.saveToLocal();

        console.log(`✅ Status reported for ${gateName}: ${status}`);
        this.showThankYouNotification(gateName, status);

        return report;
    },

    /**
     * Submit closure duration report
     */
    submitClosureDuration(gateId, gateName, minutes) {
        const report = {
            gateId,
            gateName,
            type: 'duration',
            durationMinutes: minutes,
            timestamp: new Date().toISOString(),
            userId: this.getUserId()
        };

        this.reports.push(report);
        this.updateUserStats(15); // 15 points for detailed info
        this.saveToLocal();

        console.log(`⏱️ Duration reported for ${gateName}: ${minutes} min`);
        return report;
    },

    /**
     * Submit a new gate location
     */
    submitNewGate(lat, lng, name) {
        const newGate = {
            id: `user-${Date.now()}`,
            lat,
            lng,
            name,
            type: 'user-submitted',
            submittedBy: this.getUserId(),
            timestamp: new Date().toISOString(),
            verified: false
        };

        this.updateUserStats(50); // 50 points for adding a gate!
        this.saveNewGate(newGate);

        console.log(`📍 New gate submitted: ${name}`);
        this.showThankYouNotification(name, 'submitted');

        return newGate;
    },

    /**
     * Get recent reports for a specific gate
     */
    getRecentReports(gateId, withinMinutes = 5) {
        const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000);
        return this.reports.filter(r =>
            r.gateId === gateId &&
            new Date(r.timestamp) > cutoffTime &&
            r.status // Only status reports
        );
    },

    /**
     * Train delay reports storage
     */
    delayReports: [],

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
