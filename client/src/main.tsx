import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initNative } from './native/bootstrap';

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
