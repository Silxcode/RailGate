/**
 * Fallback gate data for major cities
 * Used when OSM API fails or returns empty
 */
const FallbackGates = {
    // Belagavi gates (verified working)
    BGM: [
        { id: 'bgm_1', name: 'Hindwadi Railway Crossing', lat: 15.8652, lng: 74.5089, stationCode: 'BGM' },
        { id: 'bgm_2', name: 'Tilakwadi Gate', lat: 15.8523, lng: 74.4912, stationCode: 'BGM' },
        { id: 'bgm_3', name: 'Second Railway Gate', lat: 15.8497, lng: 74.5134, stationCode: 'BGM' },
        { id: 'bgm_4', name: 'Camp Area Crossing', lat: 15.8389, lng: 74.5023, stationCode: 'BGM' },
        { id: 'bgm_5', name: 'Udyamnagar Gate', lat: 15.8612, lng: 74.4856, stationCode: 'BGM' }
    ],

    // Hubli gates
    UBL: [
        { id: 'ubl_1', name: 'Gokul Road Crossing', lat: 15.3647, lng: 75.1239, stationCode: 'UBL' },
        { id: 'ubl_2', name: 'Unkal Lake Gate', lat: 15.3523, lng: 75.1402, stationCode: 'UBL' },
        { id: 'ubl_3', name: 'Old Hubli Crossing', lat: 15.3689, lng: 75.1178, stationCode: 'UBL' }
    ],

    // Solapur gates
    SUR: [
        { id: 'sur_1', name: 'Railway Line Road Crossing', lat: 17.6599, lng: 75.9064, stationCode: 'SUR' },
        { id: 'sur_2', name: 'Hotgi Road Gate', lat: 17.6712, lng: 75.9123, stationCode: 'SUR' }
    ],

    /**
     * Get fallback gates for a station
     */
    getGatesForStation(stationCode) {
        return this[stationCode] || [];
    }
};

window.FallbackGates = FallbackGates;
