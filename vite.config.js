import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    // Ensure all assets are copied correctly
    publicDir: 'public',

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
