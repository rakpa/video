import { useState } from 'react';
import { navigate } from '../hooks/useRoute';
import { isNativeApp } from '../utils/nativeSave';

const KEY = 'vc-cookie-consent';

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Cookie banner for the website. The Meta Pixel (index.html) loads only after
 * the visitor accepts; declining keeps the site fully usable with no tracking.
 */
export function CookieConsent() {
  const [choice, setChoice] = useState<string | null>(() => stored());
  if (isNativeApp() || choice) return null;

  const decide = (value: 'yes' | 'no') => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode — choice lasts for this visit only */
    }
    if (value === 'yes') (window as unknown as { vcLoadPixel?: () => void }).vcLoadPixel?.();
    setChoice(value);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[1100] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:inset-x-auto sm:right-4 sm:left-auto"
    >
      <p className="text-sm leading-relaxed text-slate-600">
        We use cookies to measure visits and our advertising.{' '}
        <button onClick={() => navigate('/privacy')} className="font-medium text-indigo-600 hover:underline">
          Privacy Policy
        </button>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => decide('yes')}
          className="btn-gradient flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white"
        >
          Accept
        </button>
        <button
          onClick={() => decide('no')}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
