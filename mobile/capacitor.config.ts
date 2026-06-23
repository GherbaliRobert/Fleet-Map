import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ro.ratracks.app',
  appName: 'RA Tracks',
  webDir: 'dist',
  // Fără server.url → web-ul e împachetat LOCAL în APK; API-ul remote se cheamă via CapacitorHttp.
  plugins: {
    SplashScreen: {
      backgroundColor: '#0B0E11',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 800,
    },
    // overlaysWebView → webview-ul desenează ÎN SPATELE barei de stare (full-screen / edge-to-edge).
    // Înălțimea barei e compensată în CSS prin env(safe-area-inset-top) (--sat).
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#0B0E11' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
};

export default config;
