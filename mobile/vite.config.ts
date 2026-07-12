import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// În dev (browser), proxy-uim /api către backend-ul local ca să evităm CORS.
// Pe device, app-ul folosește CapacitorHttp cu URL absolut (VITE_API_BASE) → fără CORS.
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.DEV_API || 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', target: 'es2020', sourcemap: false },
  assetsInclude: ['**/*.glb'], // modele 3D vehicule (Kenney Car Kit, CC0) importate cu ?url
});
