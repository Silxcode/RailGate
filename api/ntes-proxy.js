/**
 * NTES Production Proxy (Vercel Serverless Function)
 * 
 * This function acts as a bridge between the browser and Indian Railways (NTES).
 * It solves the following production issues:
 * 1. CORS: The browser won't allow direct calls to NTES.
 * 2. Headers: Injects human-mimic headers (Origin, Referer, User-Agent).
 * 3. Cookies: Strips "Domain=enquiry.indianrail.gov.in" from Set-Cookie headers
 *    so the browser accepts session cookies on the Vercel domain.
 */

const TARGET_HOST = 'enquiry.indianrail.gov.in';
const TARGET_URL = `https://${TARGET_HOST}`;

export default async function handler(req, res) {
    // 1. Get the path after /api/ntes-proxy
    // Example: /api/ntes-proxy/q?opt=... -> /mntes/q?opt=...
    const url = new URL(req.url, `https://${req.headers.host}`);
    const targetPath = url.pathname.replace(/^\/api\/ntes-proxy/, '/mntes');
    const targetUrl = `${TARGET_URL}${targetPath}${url.search}`;

    try {
        // 2. Forward the request with specific headers
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Origin': TARGET_URL,
                'Referer': `${TARGET_URL}/mntes/`,
                'Accept': req.headers['accept'] || '*/*',
                'Accept-Language': req.headers['accept-language'] || 'en-IN,en;q=0.9',
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
                // Forward original cookies (JSESSIONID, etc.) if they exist
                'Cookie': req.headers['cookie'] || '',
            },
            // Forward body if it's a POST
            body: req.method === 'POST' ? await req.text() : undefined,
            redirect: 'manual' // Handle redirects manually or let fetch follow them
        });

        // 3. Process headers to fix Cookie Domain
        const responseHeaders = new Headers(response.headers);
        
        // Rewrite Set-Cookie headers: remove "Domain=enquiry.indianrail.gov.in"
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length > 0) {
            responseHeaders.delete('set-cookie');
            setCookies.forEach(cookie => {
                const cleanedCookie = cookie
                    .replace(/Domain=[^; ]+;?/gi, '')
                    .replace(/Secure;?/gi, ''); // Optional: remove Secure if not using HTTPS (Vercel usually has it)
                res.setHeader('Set-Cookie', cleanedCookie);
            });
        }

        // 4. Send the response back to browser
        const body = await response.text();
        res.status(response.status).send(body);

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Failed to proxy request to NTES' });
    }
}
