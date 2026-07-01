/**
 * Native (Capacitor) bootstrap. Every call is a no-op on the web build — guarded
 * by Capacitor.isNativePlatform() — so the same bundle runs in the browser and
 * inside the iOS WKWebView shell.
 */
import { Capacitor } from '@capacitor/core';

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Lazy-import the plugins so the web bundle never pulls in native code paths.
  const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/app'),
  ]);

  // Mark the DOM as native so CSS can opt into native-only tweaks if needed.
  document.documentElement.classList.add('capacitor-ios');

  try {
    // Dark icons/text on the light brand background; overlay so our safe-area
    // CSS controls the spacing beneath the status bar.
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* StatusBar unavailable (e.g. iPad multitasking) — ignore. */
  }

  // Hardware/edge back-gesture: pop client-side history, else stay put.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
  });

  // Hide the splash once React has painted.
  await SplashScreen.hide().catch(() => {});
}
