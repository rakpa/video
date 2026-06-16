import { useEffect } from 'react';
import { redeemSession } from '../api/client';
import { getLicense, setLicense, type StoredLicense } from '../lib/license';

/** Handles Stripe redirect query params (?status=success&session_id=…). */
export function useStripeReturn(onRedeemed: (license: StoredLicense) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const sessionId = params.get('session_id');
    if (status === 'cancel') {
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (status === 'success' && sessionId) {
      redeemSession(sessionId)
        .then((r) => {
          const lic: StoredLicense = { token: r.token, email: r.email, plan: r.plan, expiresAt: r.expiresAt };
          setLicense(lic);
          onRedeemed(lic);
        })
        .catch(() => {
          /* parent may surface error */
        })
        .finally(() => {
          window.history.replaceState({}, '', window.location.pathname);
        });
    }
  }, [onRedeemed]);
}

export function readStoredLicense(): StoredLicense | null {
  return getLicense();
}
