/**
 * Main Application Controller - Pan India Version
 */
const App = {
    currentScreen: 'city-search',
    selectedCity: null,
    selectedStation: null,
    gates: [],
    trains: [],
    trainDelays: {},

    async init() {
        console.log('RailGate India: Initializing...');

        // Load Station Database
        await StationService.init();

        // Setup event listeners
        this.setupEventListeners();

        // Show city search screen
        this.showScreen('city-search');
        this.renderPopularCities();
    },

    /**
     * Screen Navigation
     */
    showScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));

        // Show target screen
        const screen = document.getElementById(`${screenName}-screen`);
        if (screen) screen.classList.remove('hidden');

        this.currentScreen = screenName;
        this.updateHeader();
    },

    updateHeader(retryCount = 0) {
        const backBtn = document.getElementById('back-btn');
        const addBtn = document.getElementById('add-gate-btn');
        const title = document.getElementById('app-title');

        // Safety check with max retries
        if (!title || !backBtn || !addBtn) {
            if (retryCount < 10) {  // Max 10 retries = 1 second
                console.warn('Header elements not found, retrying...');
                setTimeout(() => this.updateHeader(retryCount + 1), 100);
            } else {
                console.error('Header elements not found after 10 retries. Skipping header update.');
            }
            return;
        }

        // Show/hide back button
        if (this.currentScreen === 'city-search') {
            backBtn.classList.add('hidden');
            addBtn.classList.add('hidden');
            title.textContent = 'RailGate India';
        } else if (this.currentScreen === 'station') {
            backBtn.classList.remove('hidden');
            addBtn.classList.add('hidden');
            title.textContent = this.selectedCity || 'Stations';
        } else if (this.currentScreen === 'gates') {
            backBtn.classList.remove('hidden');
            addBtn.classList.remove('hidden');
            title.textContent = this.selectedStation?.name || 'Gates';
        }
    },

    handleBack() {
        if (this.currentScreen === 'station') {
            this.selectedCity = null;
            this.showScreen('city-search');
        } else if (this.currentScreen === 'gates') {
            // Clear map markers when going back
            if (window.MapService && window.MapService.map) {
                window.MapService.map.eachLayer((layer) => {
                    if (layer !== window.MapService.tileLayer) {
                        window.MapService.map.removeLayer(layer);
                    }
                });
            }
            this.gates = [];
            this.showScreen('station');
        }
    },

    /**
     * City Search & Selection
     */
    renderPopularCities() {
        const container = document.getElementById('popular-cities');
        const cities = StationService.getPopularCities(10);

        container.innerHTML = cities.map(city => `
            <div class="city-card" data-city="${city.name}">
                <h3>${city.name}</h3>
                <p>${city.stationCount} station${city.stationCount > 1 ? 's' : ''}</p>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.city-card').forEach(card => {
            card.onclick = () => this.selectCity(card.dataset.city);
        });
    },

    searchCities(query) {
        const container = document.getElementById('city-results');

        if (!query || query.length < 2) {
            container.innerHTML = '';
            return;
        }

        // Show loading
        container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Searching cities...</p></div>';

        // Simulate async search (already instant, but shows pattern)
        setTimeout(() => {
            const results = StationService.searchCities(query);

            if (results.length === 0) {
                container.innerHTML = `
                    <div class="error-container">
                        <div class="error-icon">No cities found</div>
                        <h3>No cities found</h3>
                        <p>Try searching for another city name</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = results.map(city => `
                <div class="city-card" data-city="${city.name}" style="margin-bottom: 0.75rem;">
                    <h3>${city.name}</h3>
                    <p>${city.stationCount} station${city.stationCount > 1 ? 's' : ''}</p>
                </div>
            `).join('');

            container.querySelectorAll('.city-card').forEach(card => {
                card.onclick = () => this.selectCity(card.dataset.city);
            });
        }, 100);
    },

    selectCity(cityName) {
        this.selectedCity = cityName;
        this.showStations(cityName);
    },

    /**
     * Station Selection
     */
    showStations(cityName) {
        const stations = StationService.getStationsByCity(cityName);

        if (stations.length === 0) {
            alert('No stations found in this city');
            return;
        }

        document.getElementById('station-city-name').textContent = `Station in ${cityName} Stations`;
        const list = document.getElementById('station-list');

        list.innerHTML = stations.map(station => `
            <div class="station-card" data-code="${station.code}">
                <h3>${station.name}</h3>
                <span class="station-code">${station.code}</span>
                <div class="station-details">
                    ${station.zone ? `Zone: ${station.zone}` : ''} • ${station.state || ''}
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.station-card').forEach(card => {
            card.onclick = () => this.selectStation(card.dataset.code);
        });

        this.showScreen('station');
    },

    selectStation(stationCode) {
        this.selectedStation = StationService.getStationByCode(stationCode);
        console.log('Selected station:', this.selectedStation);

        this.loadGatesForStation(this.selectedStation);
    },

    /**
     * Load Gates & Map
     */
    async loadGatesForStation(station) {
        this.showScreen('gates');

        // Initialize map centered on station
        MapService.init('map', [station.lat, station.lng], 14);

        // Fetch gates near station
        try {
            this.gates = await GateService.fetchGatesNearStation(station);
            this.trains = await TrainService.fetchSchedulesForStation(station);

            await this.refreshDelays();
            this.render();
        } catch (err) {
            console.error('Failed to load gates:', err);
            this.gates = [];
            this.render();
        }
    },

    async refreshDelays() {
        if (document.hidden) {
            console.log('⏸️ Skipping delay refresh (tab hidden)');
            return;
        }

        try {
            this.trainDelays = await StatusPredictor.fetchTrainDelays(this.trains);
            const delayCount = Object.keys(this.trainDelays).length;
            console.log(`🚂 Delays fetched: ${delayCount} train${delayCount !== 1 ? 's' : ''} with delays`);
            this.render();
        } catch (err) {
            console.warn('Failed to fetch delays:', err);
        }
    },

    render() {
        const crowdReports = CrowdService.reports || [];

        const gatesWithStatus = this.gates.map(gate => ({
            ...gate,
            prediction: StatusPredictor.predict(gate, this.trains, crowdReports, this.trainDelays)
        }));

        MapService.renderGates(gatesWithStatus, (gate) => this.showGateDetail(gate));
        this.renderGateList(gatesWithStatus);
    },

    renderGateList(gates) {
        const listContainer = document.getElementById('gate-list');
        const countElement = document.getElementById('gate-count');

        countElement.innerText = `${gates.length} gates found`;
        listContainer.innerHTML = gates.length === 0
            ? '<p style="text-align:center; padding:2rem; color:#64748b;">No gates found nearby</p>'
            : gates.map(gate => `
                <div class="gate-card" data-id="${gate.id}">
                    <div class="gate-info">
                        <h3>${gate.name}</h3>
                        <p>${gate.prediction.message}</p>
                    </div>
                    <div class="status-badge status-${gate.prediction.status}">
                        ${gate.prediction.status}
                    </div>
                </div>
            `).join('');

        listContainer.querySelectorAll('.gate-card').forEach((card, i) => {
            card.onclick = () => this.showGateDetail(gates[i]);
        });
    },

    showGateDetail(gate) {
        // Similar to before - show gate details with report buttons
        document.getElementById('gate-list-view').classList.add('hidden');
        document.getElementById('gate-detail-view').classList.remove('hidden');

        document.getElementById('gate-details').innerHTML = `
            <h2>${gate.name}</h2>
            <div class="status-badge status-${gate.prediction.status}">${gate.prediction.status.toUpperCase()}</div>
            <p style="margin-top:1rem;">${gate.prediction.dataSource || '📅 Schedule'} | ${Math.round(gate.prediction.confidence * 100)}%</p>
            ${gate.prediction.quality ? `<p style="font-size:0.875rem;color:#64748b;">📊 ${gate.prediction.quality.reportCount} reports • ${gate.prediction.quality.latestUpdate}</p>` : ''}
            
            <div style="margin-top:1.5rem; background:#f1f5f9; padding:1rem; border-radius:12px;">
                <p style="font-weight:500; font-size:0.875rem; margin-bottom:0.75rem;">Is the gate actually open or closed?</p>
                <div style="display:flex; gap:0.5rem;">
                    <button id="report-open-btn" class="btn-report btn-report-open">✅ OPEN</button>
                    <button id="report-closed-btn" class="btn-report btn-report-closed">🔴 CLOSED</button>
                </div>
            </div>

            <div style="margin-top:1.5rem; background:#fef3c7; padding:1rem; border-radius:12px;">
                <p style="font-weight:500; font-size:0.875rem; margin-bottom:0.75rem;">Report Train Delay</p>
                <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem;">
                    <input type="text" id="train-number" placeholder="Train # (e.g., 12345)" style="flex:1; padding:0.5rem; border:1px solid #e2e8f0; border-radius:8px; font-size:0.875rem;">
                    <input type="number" id="delay-minutes" placeholder="Delay (min)" style="width:100px; padding:0.5rem; border:1px solid #e2e8f0; border-radius:8px; font-size:0.875rem;">
                </div>
                <button id="report-delay-btn" class="btn-report" style="width:100%; background:#f59e0b;">Submit Delay</button>
            </div>

            <div style="margin-top:1rem;">
                <p style="font-size:0.75rem; color:#94a3b8;">Points: ${CrowdService.getUserStats().points} | Level ${CrowdService.getUserStats().level}</p>
            </div>
        `;

        document.getElementById('report-open-btn').onclick = () => this.handleStatusReport(gate, 'open');
        document.getElementById('report-closed-btn').onclick = () => this.handleStatusReport(gate, 'closed');
        document.getElementById('report-delay-btn').onclick = () => this.handleDelayReport(gate);
    },

    handleDelayReport(gate) {
        const trainNumber = document.getElementById('train-number').value.trim();
        const delayMinutes = parseInt(document.getElementById('delay-minutes').value);

        if (!trainNumber || !delayMinutes || delayMinutes < 0) {
            alert('Please enter valid train number and delay minutes');
            return;
        }

        CrowdService.submitDelayReport({
            trainNumber,
            delayMinutes,
            station: gate.name,
            timestamp: new Date().toISOString()
        });

        document.getElementById('train-number').value = '';
        document.getElementById('delay-minutes').value = '';

        this.render();
        setTimeout(() => this.showGateDetail(gate), 2000);
    },

    handleStatusReport(gate, status) {
        CrowdService.submitReport(gate.id, gate.name, status);
        this.render();
        setTimeout(() => this.showGateDetail(gate), 2500);
    },

    backToList() {
        document.getElementById('gate-list-view').classList.remove('hidden');
        document.getElementById('gate-detail-view').classList.add('hidden');
    },

    setupEventListeners() {
        // Back button
        document.getElementById('back-btn').onclick = () => this.handleBack();

        // City search
        document.getElementById('city-search-input').oninput = (e) => this.searchCities(e.target.value);

        // Gate detail back
        document.getElementById('back-to-list').onclick = () => this.backToList();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
