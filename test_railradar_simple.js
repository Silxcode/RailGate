/**
 * Test RailRadar API with correct parameters
 */

import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const apiKeyMatch = envFile.match(/VITE_RAILRADAR_API_KEY=(.+)/);
const API_KEY = apiKeyMatch ? apiKeyMatch[1].trim() : null;

const BASE_URL = 'https://api.railradar.in/api/v1';

async function testStationLive(stationCode, hours = 2) {
    console.log(`\n🔍 Testing: ${stationCode} (next ${hours} hours)`);
    console.log('='.repeat(60));

    if (!API_KEY) {
        console.error('❌ API key not found');
        return;
    }

    // Add required query parameter
    const endpoint = `${BASE_URL}/stations/${stationCode}/live?hours=${hours}`;
    console.log(`📡 ${endpoint}\n`);

    try {
        const response = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'X-API-Key': API_KEY
            }
        });

        console.log(`📊 Status: ${response.status}`);

        const data = await response.json();

        if (!response.ok) {
            console.error('\n❌ Error:', JSON.stringify(data, null, 2));
            return;
        }

        console.log('\n✅ SUCCESS! Response:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(data, null, 2));

        if (data.data) {
            const arrivals = data.data.arrivals || [];
            const departures = data.data.departures || [];

            console.log('\n📋 Summary:');
            console.log(`   Arrivals: ${arrivals.length}`);
            console.log(`   Departures: ${departures.length}`);

            if (arrivals.length > 0) {
                console.log(`\n🚂 Next Arrival:`);
                const t = arrivals[0];
                console.log(`   Train: ${t.trainNumber} - ${t.trainName}`);
                console.log(`   Scheduled: ${t.scheduledArrival}`);
                console.log(`   Expected: ${t.expectedArrival || t.scheduledArrival}`);
                console.log(`   Delay: ${t.delayMinutes || 0} min`);
                console.log(`   Status: ${t.status || 'N/A'}`);
            }

            console.log(`\n✅ VERIFIED: RailRadar provides real-time station arrivals!`);
        }

    } catch (error) {
        console.error(`\n❌ Failed: ${error.message}`);
    }
}

console.log('🚀 RailRadar API Verification (with hours parameter)\n');
await testStationLive('BGM', 2); // Belgaum, next 2 hours
console.log('\n' + '='.repeat(60));
