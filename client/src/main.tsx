import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { MotionGlobalConfig } from 'framer-motion';
import { initNative } from './native/bootstrap';

// Native app: render every animated element in its final state. Entrance
// animations could stall while iOS system UI (paste / Photos permission, share
// sheet) covered the web view, leaving the headline and cards invisible.
if (Capacitor.isNativePlatform()) {
  MotionGlobalConfig.skipAnimations = true;
}

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Native-only setup (status bar, splash, back button). No-op in the browser.
void initNative();
