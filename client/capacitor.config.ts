import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the native iOS shell.
 *
 * Strategy: we bundle the built web assets (webDir: 'dist') INTO the app rather
 * than pointing `server.url` at https://vidcliply.com. A bundled app that calls
 * the API over HTTPS reads as a real app to App Review; a thin URL wrapper risks
 * rejection under Guideline 4.2 (minimum functionality). Build the web app with
 * VITE_API_URL set to the production API before `npx cap sync` (see ios/README).
 */
const config: CapacitorConfig = {
  appId: 'com.vidcliply.app',
  appName: 'VidCliply',
  webDir: 'dist',
  ios: {
    // Serve bundled assets over https://localhost so browser APIs (clipboard,
    // Web Share, fetch to the API) behave like a secure context.
    scheme: 'VidCliply',
    contentInset: 'always',
    backgroundColor: '#f8fafc',
    // Let our own CSS env(safe-area-inset-*) handle insets; keep the webview
    // full-bleed under the status bar.
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#f8fafc',
      showSpinner: false,
      launchAutoHide: true,
    },
    StatusBar: {
      // Dark text on the light brand background.
      style: 'LIGHT',
      backgroundColor: '#f8fafc',
      overlaysWebView: true,
    },
  },
};

export default config;
