import { defineConfig } from 'vite'

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
                main: './index.html'
            }
        }
    }
})
