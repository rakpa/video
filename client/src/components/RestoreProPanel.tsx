import { useState } from 'react';
import { ApiError, restoreProAccess } from '../api/client';
import { setLicense, type StoredLicense } from '../lib/license';

interface Props {
  onRestored: (license: StoredLicense) => void;
}

/** Lets returning Pro customers re-activate on this device via checkout email. */
export function RestoreProPanel({ onRestored }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await restoreProAccess(email.trim());
      const lic: StoredLicense = {
        token: result.token,
        email: result.email,
        plan: result.plan,
        expiresAt: result.expiresAt,
      };
      setLicense(lic);
      onRestored(lic);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not restore Pro access.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass mt-8 rounded-3xl p-5 shadow-card sm:p-6">
      <h2 className="text-center text-lg font-bold text-slate-900">Already purchased Pro?</h2>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm text-slate-600">
        Sign out only removes Pro on this device. Enter the email from your Stripe receipt to restore access.
      </p>

      <form onSubmit={submit} className="mx-auto mt-5 max-w-sm space-y-3">
        <label className="block">
          <span className="sr-only">Email used at checkout</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-accent/30 transition focus:border-accent/50 focus:ring-2"
          />
        </label>

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              Restoring…
            </>
          ) : (
            'Restore Pro access'
          )}
        </button>
      </form>
    </div>
  );
}
