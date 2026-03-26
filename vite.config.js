import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    // Ensure all assets are copied correctly
    publicDir: 'public',

    // NTES Proxy: bypass CORS by routing through Vite dev server
    server: {
        proxy: {
            '/api/ntes': {
                target: 'https://enquiry.indianrail.gov.in',
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api\/ntes/, '/mntes'),
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq) => {
                        proxyReq.setHeader('Origin', 'https://enquiry.indianrail.gov.in');
                        proxyReq.setHeader('Referer', 'https://enquiry.indianrail.gov.in/mntes/');
                        proxyReq.setHeader('Accept-Language', 'en-IN,en;q=0.9,hi;q=0.8');
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
