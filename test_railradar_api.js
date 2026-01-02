/**
 * Test script to verify RailRadar API provides real-time station arrivals
 * Run with: node test_railradar_api.js
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VITE_RAILRADAR_API_KEY;
const BASE_URL = 'https://api.railradar.in/api/v1';

async function testStationLiveData(stationCode) {
    console.log(`\n🔍 Testing RailRadar API for station: ${stationCode}`);
    console.log('='.repeat(60));

    if (!API_KEY) {
        console.error('❌ VITE_RAILRADAR_API_KEY not found in .env file');
        return;
    }

    const endpoint = `${BASE_URL}/stations/${stationCode}/live`;

    try {
        console.log(`📡 Calling: ${endpoint}`);

        const response = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'X-API-Key': API_KEY,
                'User-Agent': 'RailGate/1.0 (Testing)'
            }
        });

        console.log(`📊 Response Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error: ${errorText}`);
            return;
        }

        const data = await response.json();
        console.log('\n✅ API Response Received!\n');
        console.log(JSON.stringify(data, null, 2));

        // Analyze the response
        console.log('\n📋 Analysis:');
        console.log('='.repeat(60));

        if (data.success === false) {
            console.log(`❌ Success: ${data.success}`);
            console.log(`   Message: ${data.message || 'Unknown error'}`);
        } else if (data.data) {
            const arrivals = data.data.arrivals || [];
            const departures = data.data.departures || [];

            console.log(`✅ Success: true`);
            console.log(`📥 Arrivals: ${arrivals.length} trains`);
            console.log(`📤 Departures: ${departures.length} trains`);

            if (arrivals.length > 0) {
                console.log('\n🚂 Sample Arrival (First Train):');
                const first = arrivals[0];
                console.log(`   Train: ${first.trainName} (${first.trainNumber})`);
                console.log(`   Scheduled: ${first.scheduledArrival}`);
                console.log(`   Expected: ${first.expectedArrival || 'N/A'}`);
                console.log(`   Delay: ${first.delayMinutes || 0} minutes`);
                console.log(`   Platform: ${first.platform || 'N/A'}`);
            }
        } else {
            console.log('⚠️  Unexpected response structure');
        }

    } catch (error) {
        console.error('❌ Test Failed:', error.message);
    }
}

// Test with Belgaum station
console.log('🚀 RailRadar API Test Suite');
console.log('Testing station arrivals endpoint...\n');

await testStationLiveData('BGM'); // Belgaum Junction

console.log('\n' + '='.repeat(60));
console.log('✅ Test Complete!');
