# [PLAN] NTES Safe Scraper - Human Mimicry Strategy

## Goal
Implement a resilient, "human-like" scraping mechanism for `indianrail.gov.in` (NTES) to provide high-quality fallback data for train running status without using paid APIs.

## [PHASE 1] Infrastructure: CORS Bypass
> [!IMPORTANT]
> Since browsers block direct requests to `indianrail.gov.in`, we must use a proxy.

- **Development**: Configure `vite.config.js` to proxy `/api/ntes` to `https://enquiry.indianrail.gov.in`.
- **Production**: Placeholder for a server-side "CORS Proxy" (e.g., a simple Node.js lambda).

## [PHASE 2] Human-Mimicry Logic
To avoid being flagged as a bot, the scraper will follow a "search sequence":

1. **Session Warming**: First, fetch the NTES landing page (no data request) to obtain a valid `JSESSIONID` cookie.
2. **Realistic Headers**: Use a rotating pool of valid Mobile/Desktop `User-Agent` strings.
3. **Natural Delays**: Implement `setTimeout` with jitter (e.g., `2000ms + random(500ms)`) between navigation steps.
4. **Mobile API Priority**: Target the `/mntes/api` endpoints (used by the mobile app) as they are often less restricted than the full desktop HTML pages.

## [PHASE 3] "Good Citizen" Controls
- **Global Rate Limit**: Max 1 request per 30 seconds per client.
- **Caching Layer**: 
    - Store successful scrapes in **Supabase** (table: `train_status_cache`).
    - If another user asks for the same train within 5 minutes, serve from Supabase instead of hitting NTES again.
- **Circuit Breaker**: If the site returns `403` or `429`, the service "goes dark" for 1 hour to prevent IP blacklisting.

## [PHASE 4] Implementation Logic
- **`js/services/ntesService.js`**:
    - Add `initSession()` (fetch landing page).
    - Add `fetchProxy()` (wrapped fetch with jitter and headers).
    - Update `parse()` (robust JSON/HTML selection).

## Verification Checklist
- [ ] Proxy `/api/ntes` returns data in Node (curl test)
- [ ] `ntesService` successfully warms session in browser
- [ ] Data parsing matches current NTES JSON structure
- [ ] Rate limit correctly blocks rapid-fire requests
