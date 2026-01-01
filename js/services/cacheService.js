/**
 * IndexedDB Cache Service for RailGate
 * Replaces localStorage with 50MB+ storage
 */
const CacheService = {
    db: null,
    DB_NAME: 'RailGateDB',
    DB_VERSION: 1,

    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.warn('IndexedDB failed, falling back to localStorage');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Gates store
                if (!db.objectStoreNames.contains('gates')) {
                    const gateStore = db.createObjectStore('gates', { keyPath: 'stationCode' });
                    gateStore.createIndex('timestamp', 'timestamp');
                }

                // Train delays store
                if (!db.objectStoreNames.contains('delays')) {
                    const delayStore = db.createObjectStore('delays', { keyPath: 'trainNumber' });
                    delayStore.createIndex('timestamp', 'timestamp');
                    delayStore.createIndex('stationCode', 'stationCode');
                }

                // Crowdsource reports store
                if (!db.objectStoreNames.contains('reports')) {
                    const reportStore = db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
                    reportStore.createIndex('gateId', 'gateId');
                    reportStore.createIndex('timestamp', 'timestamp');
                }
            };
        });
    },

    /**
     * Save gates for a station
     */
    async saveGates(stationCode, gates, tracks) {
        if (!this.db) return this._fallbackSave(`gates_${stationCode}`, { gates, tracks });

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('gates', 'readwrite');
            const store = tx.objectStore('gates');

            const data = {
                stationCode,
                gates,
                tracks,
                timestamp: Date.now()
            };

            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get gates for a station
     */
    async getGates(stationCode) {
        if (!this.db) return this._fallbackGet(`gates_${stationCode}`);

        return new Promise((resolve) => {
            const tx = this.db.transaction('gates', 'readonly');
            const store = tx.objectStore('gates');
            const request = store.get(stationCode);

            request.onsuccess = () => {
                const data = request.result;
                if (!data) return resolve(null);

                const TTL = 24 * 60 * 60 * 1000; // 24 hours
                if (Date.now() - data.timestamp < TTL) {
                    resolve({ gates: data.gates, tracks: data.tracks });
                } else {
                    this.deleteGates(stationCode);
                    resolve(null);
                }
            };

            request.onerror = () => resolve(null);
        });
    },

    /**
     * Delete expired gates
     */
    async deleteGates(stationCode) {
        if (!this.db) return localStorage.removeItem(`gates_${stationCode}`);

        return new Promise((resolve) => {
            const tx = this.db.transaction('gates', 'readwrite');
            const store = tx.objectStore('gates');
            store.delete(stationCode);
            resolve();
        });
    },

    /**
     * Fallback to localStorage
     */
    _fallbackSave(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (err) {
            console.warn('Cache save failed:', err);
        }
    },

    _fallbackGet(key) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                return data;
            }
            localStorage.removeItem(key);
        } catch {
            return null;
        }
        return null;
    },

    /**
     * Migrate from localStorage to IndexedDB
     */
    async migrateFromLocalStorage() {
        console.log('🔄 Migrating from localStorage...');
        let count = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('gates_')) {
                const stationCode = key.replace('gates_', '');
                const data = this._fallbackGet(key);
                if (data) {
                    await this.saveGates(stationCode, data.gates, data.tracks);
                    localStorage.removeItem(key);
                    count++;
                }
            }
        }

        console.log(`✅ Migrated ${count} cache entries`);
    }
};

// Auto-initialize
(async () => {
    try {
        await CacheService.init();
        await CacheService.migrateFromLocalStorage();
    } catch (err) {
        console.warn('Using localStorage fallback:', err);
    }
})();

window.CacheService = CacheService;
