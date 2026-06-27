import { navigate } from '../hooks/useRoute';
import { COMPANY } from '../config/company';

interface Props {
  className?: string;
}

/** Brand mark — play icon + VidCliply wordmark, links home. */
export function BrandLogo({ className = '' }: Props) {
  return (
    <button
      onClick={() => navigate('/')}
      className={`flex items-center gap-2.5 ${className}`}
      aria-label={`${COMPANY.brand} — home`}
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-gradient shadow-glow-soft">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7L8 5Z" />
        </svg>
      </div>
      <span className="text-lg font-bold tracking-tight text-slate-900">{COMPANY.brand}</span>
    </button>
  );
}
