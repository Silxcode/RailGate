
import { supabase } from './services/supabase.js';

// DOM Elements
const authCheck = document.getElementById('auth-check');
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const gatesList = document.getElementById('gates-list');
const loginError = document.getElementById('login-error');

// Stats Elements
const statPending = document.getElementById('stat-pending');
const statStations = document.getElementById('stat-stations');
const statUsers = document.getElementById('stat-users');

// Initialization
async function init() {
    // Check current session
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        showDashboard(session.user);
    } else {
        showLogin();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
            showDashboard(session.user);
        } else {
            showLogin();
        }
    });
}

// Show Login Screen
function showLogin() {
    authCheck.classList.add('hidden');
    dashboardScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
}

// Show Dashboard Screen
function showDashboard(user) {
    authCheck.classList.add('hidden');
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');

    console.log('Logged in as:', user.email);

    // Load initial data
    loadStats();
    loadPendingGates();
}

// Handle Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    loginError.classList.add('hidden');

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
    }
});

// Handle Logout
logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
});

// Refresh Data
refreshBtn.addEventListener('click', () => {
    loadStats();
    loadPendingGates();
});

// Import Stations (One-time setup)
async function importStations() {
    if (!confirm('Import all stations from stations.json? This might take a while.')) return;

    console.log('Fetching stations.json...');
    try {
        const response = await fetch('/data/stations.json');
        const stations = await response.json();

        console.log(`Loaded ${stations.length} stations. Starting import...`);

        // Chunk params
        const chunkSize = 100;
        let imported = 0;
        let errors = 0;

        for (let i = 0; i < stations.length; i += chunkSize) {
            const chunk = stations.slice(i, i + chunkSize).map(s => ({
                code: s.code,
                name: s.name,
                city: s.city_name || s.city, // Handle extracted city format
                state: s.state,
                zone: s.zone,
                lat: s.lat,
                lng: s.lng
            }));

            const { error } = await supabase
                .from('stations')
                .upsert(chunk, { ignoreDuplicates: true });

            if (error) {
                console.error('Error importing chunk:', error);
                errors += chunk.length;
            } else {
                imported += chunk.length;
            }

            // Progress update (optional UI feedback)
            console.log(`Progress: ${imported}/${stations.length}`);
        }

        alert(`Import complete!\nSuccess: ${imported}\nErrors: ${errors}`);
        loadStats();

    } catch (err) {
        console.error('Import failed:', err);
        alert('Import failed. Check console.');
    }
}

// Add Import Button to UI (Programmatically or in HTML)
// For now, let's expose it globally so admin can call it from console or we add a button if needed.
// Better: Add a button to the dashboard header.
window.importStations = importStations;
const headerParams = document.querySelector('.admin-container.py-4');
if (headerParams) {
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import Stations (JSON)';
    importBtn.className = 'ml-4 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded';
    importBtn.onclick = importStations;
    headerParams.querySelector('div').appendChild(importBtn); // Append to title div or creating a toolbar?
    // Let's just append to the flex container
    headerParams.appendChild(importBtn);
}

// Load Statistics
async function loadStats() {
    // Pending Gates
    const { count: pendingCount } = await supabase
        .from('gates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    statPending.textContent = pendingCount || 0;

    // Total Stations
    const { count: stationsCount } = await supabase
        .from('stations')
        .select('*', { count: 'exact', head: true });
    statStations.textContent = stationsCount || 0;

    // Total Users (Profiles)
    const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
    statUsers.textContent = usersCount || 0;
}

// Load Pending Gates
async function loadPendingGates() {
    gatesList.innerHTML = '<div class="p-8 text-center"><div class="spinner"></div></div>';

    const { data: gates, error } = await supabase
        .from('gates')
        .select('*, stations(name, city)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching gates:', error);
        gatesList.innerHTML = '<div class="p-8 text-center text-red-500">Error loading gates</div>';
        return;
    }

    if (!gates || gates.length === 0) {
        gatesList.innerHTML = '<div class="p-8 text-center text-gray-500">No pending gates found</div>';
        return;
    }

    gatesList.innerHTML = gates.map(gate => `
        <div class="gate-row">
            <div>
                <h3 class="font-bold text-gray-800">${gate.name || 'Unnamed Gate'}</h3>
                <p class="text-sm text-gray-500">
                    Station: ${gate.stations?.name} (${gate.station_code}) • 
                    City: ${gate.stations?.city}
                </p>
                <p class="text-xs text-gray-400 mt-1">
                    Submitted: ${new Date(gate.created_at).toLocaleDateString()}
                </p>
            </div>
            <div class="flex gap-2">
                <button onclick="window.open('https://www.google.com/maps?q=${gate.lat},${gate.lng}', '_blank')" 
                    class="px-3 py-1 text-sm border rounded text-gray-600 hover:bg-gray-50">
                    Map
                </button>
                <button onclick="window.approveGate('${gate.id}')" 
                    class="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                    Approve
                </button>
                <button onclick="window.rejectGate('${gate.id}')" 
                    class="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">
                    Reject
                </button>
            </div>
        </div>
    `).join('');
}

// Make functions global for onclick access
window.approveGate = async (id) => {
    if (!confirm('Approve this gate?')) return;

    const { error } = await supabase
        .from('gates')
        .update({ status: 'approved' })
        .eq('id', id);

    if (error) {
        alert('Error approving gate: ' + error.message);
    } else {
        loadPendingGates();
        loadStats();
    }
};

window.rejectGate = async (id) => {
    if (!confirm('Reject (delete) this gate?')) return;

    const { error } = await supabase
        .from('gates')
        .update({ status: 'rejected' }) // Or .delete() if you prefer hard delete
        .eq('id', id);

    if (error) {
        alert('Error rejecting gate: ' + error.message);
    } else {
        loadPendingGates();
        loadStats();
    }
};

// Start
init();
