/**
 * Zone-Based NTES Scraper
 * Rotates through 16 railway zones, scraping each zone every 5 minutes
 * Full cycle: 80 minutes (16 zones × 5 minutes)
 */

const ZoneScraper = {
    currentZoneIndex: 0,
    isRunning: false,
    scraperInterval: null,
    zoneCache: new Map(), // Cache scraped data per zone
    priorityZones: new Set(), // Zones to scrape more frequently
    priorityInterval: null,
    priorityTimeouts: new Map(), // FIX: Track timeouts to clear priorities
    _activeScrapes: new Set(), // FIX: Mutex to prevent race conditions
    ZONE_CACHE_TTL: 20 * 60 * 1000, // FIX: Reduced from 80min to 20min

    /**
     * Start the zone rotation scraper
     */
    start() {
        if (this.isRunning) {
            console.warn('Zone scraper already running');
            return;
        }

        console.log('🚀 Starting zone-based NTES scraper (5-min rotation)');
        this.isRunning = true;

        // Scrape immediately on start
        this.scrapeCurrentZone();

        // Then scrape every 5 minutes
        this.scraperInterval = setInterval(() => {
            this.scrapeCurrentZone();
        }, 5 * 60 * 1000); // 5 minutes

        // Priority zones scrape every 2 minutes
        this.priorityInterval = setInterval(() => {
            this.scrapePriorityZones();
        }, 2 * 60 * 1000); // 2 minutes
    },

    /**
     * Stop the scraper
     */
    stop() {
        if (this.scraperInterval) {
            clearInterval(this.scraperInterval);
            this.scraperInterval = null;
        }
        if (this.priorityInterval) {
            clearInterval(this.priorityInterval);
            this.priorityInterval = null;
        }
        this.isRunning = false;
        console.log('⏸️ Zone scraper stopped');
    },

    /**
     * Scrape current zone and rotate to next
     */
    async scrapeCurrentZone() {
        if (!window.RAILWAY_ZONES || RAILWAY_ZONES.length === 0) {
            console.error('Railway zones not loaded');
            return;
        }

        const zone = RAILWAY_ZONES[this.currentZoneIndex];
        console.log(`🌐 Scraping Zone ${this.currentZoneIndex + 1}/16: ${zone.name} (${zone.id})`);

        try {
            const zoneData = await this._scrapeZone(zone);

            // Cache the results
            this.zoneCache.set(zone.id, {
                data: zoneData,
                scrapedAt: new Date(),
                zone: zone
            });

            console.log(`✅ Zone ${zone.id} scraped: ${zoneData.trains.length} trains cached`);

        } catch (error) {
            console.error(`❌ Failed to scrape zone ${zone.id}:`, error.message);
        }

        // Rotate to next zone
        this.currentZoneIndex = (this.currentZoneIndex + 1) % RAILWAY_ZONES.length;

        // Log progress
        const cycleProgress = Math.round((this.currentZoneIndex / RAILWAY_ZONES.length) * 100);
        console.log(`📊 Cycle progress: ${cycleProgress}% | Next: ${RAILWAY_ZONES[this.currentZoneIndex].name}`);
    },

    /**
     * Scrape all stations in a zone
     */
    async _scrapeZone(zone) {
        // FIX: Mutex - prevent scraping same zone simultaneously
        if (this._activeScrapes.has(zone.id)) {
            console.log(`⏭️ Zone ${zone.id} already being scraped, skipping`);
            return { zoneId: zone.id, zoneName: zone.name, trains: [], stationCount: 0 };
        }

        this._activeScrapes.add(zone.id);

        try {
            const trains = new Map(); // Deduplicate trains by number
            const promises = [];

            // Scrape each station in the zone
            for (const stationCode of zone.stations) {
                const promise = this._scrapeStation(stationCode)
                    .then(stationTrains => {
                        stationTrains.forEach(train => {
                            // Store unique trains (deduplicate by train number)
                            if (!trains.has(train.number)) {
                                trains.set(train.number, {
                                    ...train,
                                    zone: zone.id,
                                    scrapedStation: stationCode
                                });
                            }
                        });
                    })
                    .catch(err => {
                        console.warn(`Failed to scrape ${stationCode}:`, err.message);
                    });

                promises.push(promise);

                // Small delay between station requests (200-500ms)
                await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
            }

            await Promise.allSettled(promises);

            return {
                zoneId: zone.id,
                zoneName: zone.name,
                trains: Array.from(trains.values()),
                stationCount: zone.stations.length
            };
        } finally {
            // FIX: Always release mutex
            this._activeScrapes.delete(zone.id);
        }
    },

    /**
     * Scrape live trains at a specific station using NTES
     */
    async _scrapeStation(stationCode) {
        if (typeof NTESService === 'undefined') {
            throw new Error('NTESService not available');
        }

        console.log(`  📍 Scraping station: ${stationCode}`);

        // FIX: Use real NTES station arrivals API
        try {
            const trains = await NTESService.fetchStationArrivals(stationCode, 2); // 2 hours ahead
            console.log(`    ✅ Found ${trains.length} trains at ${stationCode}`);
            return trains;
        } catch (error) {
            console.warn(`    ❌ Failed to scrape ${stationCode}:`, error.message);
            return [];
        }
    },

    /**
     * Get cached train data for a specific train number
     */
    getTrainFromCache(trainNumber) {
        // Search through all zone caches
        for (const [zoneId, cacheEntry] of this.zoneCache) {
            // FIX: Check cache age against 20min TTL
            const ageMinutes = Math.round((Date.now() - cacheEntry.scrapedAt) / 60000);
            if (ageMinutes > 20) {
                // Cache expired, skip
                continue;
            }

            const train = cacheEntry.data.trains.find(t => t.number === trainNumber);
            if (train) {
                console.log(`💾 Found train ${trainNumber} in zone ${zoneId} cache (age: ${ageMinutes} min)`);
                return {
                    ...train,
                    cacheAge: ageMinutes,
                    fromCache: true
                };
            }
        }

        return null;
    },

    /**
     * Get all cached trains across all zones
     */
    getAllCachedTrains() {
        const allTrains = [];

        for (const [zoneId, cacheEntry] of this.zoneCache) {
            allTrains.push(...cacheEntry.data.trains);
        }

        return allTrains;
    },

    /**
     * Get zone scraping status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            currentZone: RAILWAY_ZONES[this.currentZoneIndex].name,
            currentZoneIndex: this.currentZoneIndex,
            totalZones: RAILWAY_ZONES.length,
            cycleProgress: Math.round((this.currentZoneIndex / RAILWAY_ZONES.length) * 100),
            cachedZones: this.zoneCache.size,
            totalTrainsCached: this.getAllCachedTrains().length,
            nextScrapeIn: '5 minutes',
            fullCycleDuration: '80 minutes'
        };
    },

    /**
     * Force scrape a specific zone by ID
     */
    async forceScrapeZone(zoneId) {
        const zone = RAILWAY_ZONES.find(z => z.id === zoneId);
        if (!zone) {
            throw new Error(`Zone ${zoneId} not found`);
        }

        console.log(`🔄 Force scraping zone: ${zone.name}`);
        const zoneData = await this._scrapeZone(zone);

        this.zoneCache.set(zone.id, {
            data: zoneData,
            scrapedAt: new Date(),
            zone: zone
        });

        return zoneData;
    },

    /**
     * Prioritize a zone for more frequent scraping
     * Called when user selects a station - instantly scrapes that zone
     * FIX: Added 30-minute timeout to prevent accumulation
     * @param {string} stationCode - Station code user selected (e.g., 'BGM')
     */
    async prioritizeStation(stationCode) {
        if (typeof StationZoneMapper === 'undefined') {
            console.warn('StationZoneMapper not available');
            return;
        }

        const zone = StationZoneMapper.getZoneForStation(stationCode);
        if (!zone) {
            console.warn(`Cannot prioritize ${stationCode} - zone not found`);
            return;
        }

        console.log(`⭐ PRIORITIZING zone ${zone.name} for station ${stationCode}`);

        // Add to priority set
        this.priorityZones.add(zone.id);

        // FIX: Clear any existing timeout for this zone
        if (this.priorityTimeouts.has(zone.id)) {
            clearTimeout(this.priorityTimeouts.get(zone.id));
        }

        // FIX: Auto-remove from priority after 30 minutes
        const timeoutId = setTimeout(() => {
            this.deprioritizeZone(zone.id);
            console.log(`⏰ Auto-deprioritized zone ${zone.id} after 30 minutes`);
        }, 30 * 60 * 1000); // 30 minutes

        this.priorityTimeouts.set(zone.id, timeoutId);

        // Immediately scrape this zone
        const zoneData = await this._scrapeZone(zone);

        this.zoneCache.set(zone.id, {
            data: zoneData,
            scrapedAt: new Date(),
            zone: zone,
            isPriority: true
        });

        console.log(`✅ Priority zone ${zone.id} scraped: ${zoneData.trains.length} trains`);

        return zoneData;
    },

    /**
     * Scrape all priority zones (every 2 minutes)
     */
    async scrapePriorityZones() {
        if (this.priorityZones.size === 0) return;

        console.log(`⭐ Scraping ${this.priorityZones.size} priority zones...`);

        for (const zoneId of this.priorityZones) {
            const zone = RAILWAY_ZONES.find(z => z.id === zoneId);
            if (!zone) continue;

            try {
                const zoneData = await this._scrapeZone(zone);

                this.zoneCache.set(zone.id, {
                    data: zoneData,
                    scrapedAt: new Date(),
                    zone: zone,
                    isPriority: true
                });

                console.log(`✅ Priority ${zone.id}: ${zoneData.trains.length} trains`);
            } catch (error) {
                console.error(`❌ Priority zone ${zoneId} failed:`, error.message);
            }
        }
    },

    /**
     * Remove a zone from priority list
     * FIX: Also clear the timeout
     */
    deprioritizeZone(zoneId) {
        this.priorityZones.delete(zoneId);

        if (this.priorityTimeouts.has(zoneId)) {
            clearTimeout(this.priorityTimeouts.get(zoneId));
            this.priorityTimeouts.delete(zoneId);
        }

        console.log(`Removed ${zoneId} from priority zones`);
    },

    /**
     * Clear all priority zones
     */
    clearPriorities() {
        this.priorityZones.clear();
        console.log('Cleared all priority zones');
    }
};

// Auto-start if in browser environment
if (typeof window !== 'undefined') {
    window.ZoneScraper = ZoneScraper;

    // Start scraper when page loads (after a 5-second delay)
    setTimeout(() => {
        if (typeof RAILWAY_ZONES !== 'undefined') {
            ZoneScraper.start();
        } else {
            console.warn('Railway zones not loaded, zone scraper not started');
        }
    }, 5000);
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZoneScraper;
}
