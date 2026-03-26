/**
 * RailRadar Production Proxy (Vercel Serverless Function)
 * 
 * Proxies requests to api.railradar.in/api/v1
 * Fixes CORS and allows injecting API keys securely if needed.
 */

const TARGET_HOST = 'api.railradar.in';
const TARGET_URL = `https://${TARGET_HOST}/api/v1`;

export default async function handler(req, res) {
    const url = new URL(req.url, `https://${req.headers.host}`);
    
    // Path rewrite: /api/railradar/trains/12137 -> /api/v1/trains/12137
    const targetPath = url.pathname.replace(/^\/api\/railradar/, '');
    const targetUrl = `${TARGET_URL}${targetPath}${url.search}`;

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Accept': 'application/json',
                'X-API-Key': req.headers['x-api-key'] || '', // Forward the API key
                'User-Agent': 'RailGate/1.0 (Vercel Proxy)',
            },
            body: req.method === 'POST' ? await req.text() : undefined,
        });

        const data = await response.text();
        res.status(response.status).send(data);

    } catch (error) {
        console.error('RailRadar Proxy Error:', error);
        res.status(500).json({ error: 'Failed to proxy request to RailRadar' });
    }
}
