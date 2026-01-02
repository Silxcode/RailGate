/**
 * Supabase Cache Service for RailGate
 * Database-backed caching for cross-device persistence
 */
import { supabase } from './supabase.js';

const CacheService = {
    /**
     * Initialize (no-op for Supabase-based caching)
     */
    async init() {
        console.log('✅ Cache Service (Supabase-backed) initialized');
        // Cleanup expired entries on init
        await this.cleanupExpired();
    },

    /**
     * Save gates for a station
     */
    async saveGates(stationCode, gates, tracks) {
        const key = `gates_${stationCode}`;
        const data = { gates, tracks };
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const { error } = await supabase
            .from('cache')
            .upsert({
                key,
                data,
                expires_at: expiresAt.toISOString()
            });

        if (error) {
            console.warn('Cache save failed:', error);
        }
    },

    /**
     * Get gates for a station
     */
    async getGates(stationCode) {
        const key = `gates_${stationCode}`;

        const { data, error } = await supabase
            .from('cache')
            .select('data, expires_at')
            .eq('key', key)
            .single();

        if (error || !data) {
            return null;
        }

        // Check if expired
        if (new Date(data.expires_at) < new Date()) {
            await this.deleteGates(stationCode);
            return null;
        }

        return data.data; // { gates: [...], tracks: [...] }
    },

    /**
     * Delete expired gates
     */
    async deleteGates(stationCode) {
        const key = `gates_${stationCode}`;
        await supabase.from('cache').delete().eq('key', key);
    },

    /**
     * Cleanup all expired cache entries
     */
    async cleanupExpired() {
        const { error } = await supabase
            .from('cache')
            .delete()
            .lt('expires_at', new Date().toISOString());

        if (!error) {
            console.log('🧹 Cleaned up expired cache entries');
        }
    }
};

// Auto-initialize
(async () => {
    try {
        await CacheService.init();
    } catch (err) {
        console.warn('Cache initialization failed:', err);
    }
})();

window.CacheService = CacheService;
