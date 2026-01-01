/**
 * Handles map rendering and interactions using Leaflet
 */
const MapService = {
    map: null,
    markers: [],
    tileLayer: null,  // Store tile layer reference

    init(elementId, center, zoom) {
        // Reuse existing map if already initialized
        if (this.map) {
            console.log('♻️ Reusing existing map');
            // Clear markers only (not the tile layer)
            this.map.eachLayer((layer) => {
                if (layer === this.tileLayer) {
                    // Keep tile layer
                } else {
                    this.map.removeLayer(layer);
                }
            });
            // Recenter
            this.map.setView(center, zoom);
            // CRITICAL: Invalidate size after container might have been hidden/shown
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
            return this.map;
        }

        console.log('🗺️ Creating new map');
        this.map = L.map(elementId, {
            zoomControl: true,
            attributionControl: false
        }).setView(center, zoom);

        this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(this.map);

        return this.map;
    },

    renderGates(gates, onGateClick) {
        // Clear existing markers
        this.markers.forEach(m => this.map.removeLayer(m));
        this.markers = [];

        gates.forEach(gate => {
            const marker = L.marker([gate.lat, gate.lng], {
                icon: this.createGateIcon('unknown')
            }).addTo(this.map);

            marker.on('click', () => onGateClick(gate));
            this.markers.push(marker);
        });
    },

    createGateIcon(status) {
        const colors = {
            'open': '#22c55e',
            'closed': '#ef4444',
            'warning': '#f59e0b',
            'unknown': '#64748b'
        };

        return L.divIcon({
            className: 'custom-gate-icon',
            html: `<div style="background: ${colors[status]}; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
    },

    updateMarkerStatus(gateId, status) {
        // Find marker and update its color visually
        // implementation to follow
    }
};

window.MapService = MapService;
