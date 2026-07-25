import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// În dev (browser), proxy-uim /api către backend-ul local ca să evităm CORS.
// Pe device, app-ul folosește CapacitorHttp cu URL absolut (VITE_API_BASE) → fără CORS.
export default defineConfig({
  plugins: [preact()],
  // Push nativ ACTIV implicit: `google-services.json` e prezent în android/app, deci Firebase e configurat.
  // Înainte, flagul trebuia dat manual la build (VITE_ENABLE_PUSH=1) și lipsea din `npm run build` →
  // ORICE APK construit normal ieșea TĂCUT fără notificări push. Se poate dezactiva cu VITE_ENABLE_PUSH=0.
  define: {
    'import.meta.env.VITE_ENABLE_PUSH': JSON.stringify(process.env.VITE_ENABLE_PUSH ?? '1'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.DEV_API || 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', target: 'es2020', sourcemap: false },
  assetsInclude: ['**/*.glb'], // modele 3D vehicule (Kenney Car Kit, CC0) importate cu ?url
});
