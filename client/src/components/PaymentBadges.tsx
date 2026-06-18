/**
 * Real card-brand marks + a "Secured by Stripe" line. Replaces the plain text
 * "VISA / MC / AMEX" boxes, which read as placeholders and eroded trust on the
 * checkout panel.
 */
export function PaymentBadges() {
  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <CardChip label="Visa">
          <span className="font-extrabold italic tracking-tight text-[#1a1f71]">VISA</span>
        </CardChip>
        <CardChip label="Mastercard">
          <span className="relative flex h-3.5 w-6 items-center">
            <span className="absolute left-0 h-3.5 w-3.5 rounded-full bg-[#eb001b]" />
            <span className="absolute right-0 h-3.5 w-3.5 rounded-full bg-[#f79e1b] opacity-90" />
          </span>
        </CardChip>
        <CardChip label="American Express">
          <span className="rounded-[2px] bg-[#006fcf] px-1 text-[9px] font-bold leading-tight text-white">AMEX</span>
        </CardChip>
        <CardChip label="PayPal">
          <span className="text-[11px] font-extrabold italic">
            <span className="text-[#003087]">Pay</span><span className="text-[#0070e0]">Pal</span>
          </span>
        </CardChip>
      </div>

      <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        Secured by Stripe · 256-bit SSL encryption
      </p>
    </div>
  );
}

function CardChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="flex h-7 min-w-[42px] items-center justify-center rounded-md bg-white px-2 shadow-sm ring-1 ring-black/5"
    >
      {children}
    </span>
  );
}
