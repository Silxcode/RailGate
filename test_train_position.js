/**
 * Test RailRadar API - Full response dump
 */

import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const apiKeyMatch = envFile.match(/VITE_RAILRADAR_API_KEY=(.+)/);
const API_KEY = apiKeyMatch ? apiKeyMatch[1].trim() : null;

const BASE_URL = 'https://api.railradar.in/api/v1';

async function testTrainFull(trainNumber) {
    console.log(`\n🔍 Full response for train: ${trainNumber}`);
    console.log('='.repeat(60));

    const endpoint = `${BASE_URL}/trains/${trainNumber}`;

    try {
        const response = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'X-API-Key': API_KEY
            }
        });

        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error(`\n❌ Failed: ${error.message}`);
    }
}

await testTrainFull('17332');
