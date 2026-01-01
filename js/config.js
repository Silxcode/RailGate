/**
 * RailGate Application Configuration
 */
export const CONFIG = {
    APP_NAME: 'RailGate',
    PILOT_CITY: 'Belagavi, Karnataka',
    CENTER: [15.8497, 74.4977], // Belagavi railway station coords
    ZOOM: 14,
    MAP_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    MAP_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',

    // API Endpoints (Placeholders for real APIs in production)
    OVERPASS_API: 'https://overpass-api.de/api/interpreter',
    DATA_GOV_API: 'https://api.data.gov.in/resource/some-resource-id?api-key=YOUR_API_KEY', // Need replacement with real dataset ID

    // Get API key from .env file (Vite exposes import.meta.env)
    get RAILRADAR_API_KEY() {
        return typeof import.meta !== 'undefined' && import.meta.env
            ? import.meta.env.VITE_RAILRADAR_API_KEY
            : null;
    },

    // Status Prediction Thresholds (minutes)
    THRESHOLD_CLOSED: 5,
    THRESHOLD_WARNING: 15,

    // Local Storage Keys
    STORAGE_KEYS: {
        FAVORITES: 'railgate_favorites',
        GATES_CACHE: 'railgate_gates_cache',
        TRAINS_CACHE: 'railgate_trains_cache'
    }
};

// Make available globally for backwards compatibility
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
