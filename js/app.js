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
            <div class="glass-btn city-card p-4 rounded-xl cursor-pointer hover:bg-white/20 text-left transition-all" data-city="${city.name}">
                <h3 class="font-bold text-lg text-white mb-1">${city.name}</h3>
                <p class="text-xs text-slate-300 font-medium">${city.stationCount} station${city.stationCount > 1 ? 's' : ''}</p>
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
                <div class="glass-btn city-card p-4 rounded-xl cursor-pointer mb-2 text-left" data-city="${city.name}">
                    <h3 class="font-bold text-lg text-white mb-1">${city.name}</h3>
                    <p class="text-xs text-slate-300 font-medium">${city.stationCount} station${city.stationCount > 1 ? 's' : ''}</p>
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
            <div class="glass-btn station-card p-5 rounded-2xl cursor-pointer text-left relative overflow-hidden group active:scale-95 transition-all" data-code="${station.code}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg text-white pr-12">${station.name}</h3>
                    <span class="absolute top-4 right-4 bg-white/10 px-2 py-1 rounded text-xs font-mono text-slate-300 border border-white/10 group-hover:bg-white/20 transition-colors">${station.code}</span>
                </div>
                <div class="text-xs text-slate-400 font-medium flex items-center gap-2">
                    ${station.zone ? `<span class="bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-200 border border-indigo-500/20">Zone: ${station.zone}</span>` : ''}
                    <span class="text-slate-500">•</span>
                    <span class="text-slate-300">${station.state || ''}</span>
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
            ? '<p class="text-center p-8 text-slate-500 font-medium">No gates found nearby</p>'
            : gates.map(gate => `
                <div class="glass-btn gate-card p-4 rounded-xl flex justify-between items-center cursor-pointer group active:scale-95 transition-all border border-slate-200/50 bg-white/50 hover:bg-white/80 shadow-sm" data-id="${gate.id}">
                    <div class="flex-1 pr-4">
                        <h3 class="font-bold text-slate-900 text-base mb-1 group-hover:text-indigo-700 transition-colors">${gate.name}</h3>
                        <p class="text-xs text-slate-600 font-medium flex items-center gap-1">
                           ${gate.prediction.message}
                        </p>
                    </div>
                    <div class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                        ${gate.prediction.status === 'open' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                    gate.prediction.status === 'closed' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                        'bg-amber-100 text-amber-700 border border-amber-200'}">
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
            <h2 class="text-2xl font-bold text-slate-900 mb-2">${gate.name}</h2>
            <div class="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 
                ${gate.prediction.status === 'open' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                gate.prediction.status === 'closed' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                    'bg-amber-100 text-amber-700 border border-amber-200'}">
                ${gate.prediction.status.toUpperCase()}
            </div>
            <p class="text-sm font-medium text-slate-600 mb-1 flex items-center gap-2">
                <span class="opacity-80">${gate.prediction.dataSource || '📅 Schedule'}</span> 
                <span class="w-1 h-1 rounded-full bg-slate-400"></span> 
                <span>${Math.round(gate.prediction.confidence * 100)}% Match</span>
            </p>
            ${gate.prediction.quality ? `<p class="text-xs text-slate-500 font-medium mb-6">📊 ${gate.prediction.quality.reportCount} reports • ${gate.prediction.quality.latestUpdate}</p>` : '<div class="mb-6"></div>'}
            
            <div class="bg-white border border-slate-200/50 rounded-2xl p-5 mb-4 shadow-sm">
                <p class="font-bold text-sm text-slate-700 mb-3 block">Is the gate actually open or closed?</p>
                <div class="grid grid-cols-2 gap-3">
                    <button id="report-open-btn" class="py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-sm transition-all active:scale-95">✅ OPEN</button>
                    <button id="report-closed-btn" class="py-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-sm transition-all active:scale-95">🔴 CLOSED</button>
                </div>
            </div>

            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4">
                <p class="font-bold text-sm text-amber-800 mb-3 block">Report Train Delay</p>
                <div class="flex gap-3 mb-3">
                    <input type="text" id="train-number" placeholder="Train # (e.g. 12345)" class="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 outline-none transition-colors">
                    <input type="number" id="delay-minutes" placeholder="Delay (min)" class="w-24 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 outline-none transition-colors">
                </div>
                <button id="report-delay-btn" class="w-full py-2.5 rounded-lg bg-amber-500 text-white font-bold text-sm shadow-lg shadow-amber-500/20 hover:bg-amber-600 active:scale-95 transition-all">Submit Delay</button>
            </div>

            <div class="mt-4 text-center">
                <p class="text-xs font-medium text-slate-400">Points: ${CrowdService.getUserStats().points} | Level ${CrowdService.getUserStats().level}</p>
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
