import { navigate } from '../hooks/useRoute';
import { COMPANY } from '../config/company';

interface Props {
  className?: string;
}

/** Brand mark — logo + VidCliply wordmark, links home. */
export function BrandLogo({ className = '' }: Props) {
  return (
    <button
      onClick={() => navigate('/')}
      className={`flex items-center gap-2.5 ${className}`}
      aria-label={`${COMPANY.brand} — home`}
    >
      <img src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
      <span className="text-lg font-bold tracking-tight text-slate-900">{COMPANY.brand}</span>
    </button>
  );
}
