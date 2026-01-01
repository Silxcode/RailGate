
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
    gatesList.innerHTML = '<div class="p-12 text-center text-slate-400 font-medium"><div class="spinner border-slate-400 border-t-white"></div></div>';

    const { data: gates, error } = await supabase
        .from('gates')
        .select('*, stations(name, city)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching gates:', error);
        gatesList.innerHTML = '<div class="p-8 text-center text-rose-400 font-medium bg-rose-500/10 rounded-xl border border-rose-500/20">Error loading gates</div>';
        return;
    }

    if (!gates || gates.length === 0) {
        gatesList.innerHTML = `
            <div class="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <svg class="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="font-medium">All caught up! No pending gates.</p>
            </div>
        `;
        return;
    }

    gatesList.innerHTML = gates.map(gate => `
        <div class="glass-btn p-5 rounded-xl flex items-center justify-between group hover:bg-white/10 active:scale-[0.99] transition-all mb-3 text-white">
            <div>
                <h3 class="font-bold text-lg text-white mb-1">${gate.name || 'Unnamed Gate'}</h3>
                <p class="text-sm text-slate-300">
                    <span class="font-medium text-slate-200">${gate.stations?.name}</span> (${gate.station_code}) • 
                    <span class="text-slate-400">${gate.stations?.city}</span>
                </p>
                <p class="text-xs text-slate-500 mt-2 flex items-center gap-1 font-medium bg-black/20 inline-block px-2 py-1 rounded">
                    🗓️ ${new Date(gate.created_at).toLocaleDateString()}
                </p>
            </div>
            <div class="flex gap-2">
                <button onclick="window.open('https://www.google.com/maps?q=${gate.lat},${gate.lng}', '_blank')" 
                    class="px-4 py-2 text-sm border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors font-medium">
                    View Map
                </button>
                <button onclick="window.approveGate('${gate.id}')" 
                    class="px-4 py-2 text-sm bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 font-bold transition-colors">
                    Approve
                </button>
                <button onclick="window.rejectGate('${gate.id}')" 
                    class="px-4 py-2 text-sm bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-500/30 font-bold transition-colors">
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
