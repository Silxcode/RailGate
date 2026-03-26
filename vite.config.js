import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    // Ensure all assets are copied correctly
    publicDir: 'public',

    // Proxy rules for third-party APIs
    server: {
        proxy: {
            // NTES Proxy
            '/api/ntes-proxy': {
                target: 'https://enquiry.indianrail.gov.in',
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api\/ntes-proxy/, '/mntes'),
                cookieDomainRewrite: {
                    'enquiry.indianrail.gov.in': '',
                    '.enquiry.indianrail.gov.in': ''
                },
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq) => {
                        proxyReq.setHeader('Origin', 'https://enquiry.indianrail.gov.in');
                        proxyReq.setHeader('Referer', 'https://enquiry.indianrail.gov.in/mntes/');
                    });
                }
            },
            // RailRadar Proxy: Fix CORS and handle API limits
            '/api/railradar': {
                target: 'https://api.railradar.in',
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api\/railradar/, '/api/v1'),
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq) => {
                        proxyReq.setHeader('Origin', 'https://api.railradar.in');
                        proxyReq.setHeader('Referer', 'https://railradar.in/');
                    });
                }
            }
        }
    },

    build: {
        // Output to dist folder
        outDir: 'dist',

        // Copy all assets
        assetsDir: 'assets',

        // Don't minify for easier debugging
        minify: false,

        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                admin: resolve(__dirname, 'admin.html')
            }
        }
    }
})
