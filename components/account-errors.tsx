import type { FriendlyAccountError } from '@/lib/account-errors';
import { describeAccountErrors } from '@/lib/account-errors';

/** Inline, per-account problems (private profile, not found, Xbox busy, PSN down). Never throws. */
export function AccountErrors({ errors, className = '' }: { errors: Record<string, string> | undefined | null; className?: string }) {
  const items = describeAccountErrors(errors);
  if (items.length === 0) return null;
  return (
    <section aria-label="Account problems" className={`space-y-2 ${className}`}>
      {items.map(item => <AccountErrorItem key={item.key} item={item} />)}
    </section>
  );
}

function AccountErrorItem({ item }: { item: FriendlyAccountError }) {
  const tone = item.kind === 'busy' || item.kind === 'partial' ? 'border-amber-500/30' : 'border-zinc-700';
  return (
    <div role="status" className={`rounded-lg border ${tone} bg-zinc-900/60 p-4 text-left`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-zinc-100">{item.title}</h2>
        {item.platform && <span className="text-xs text-zinc-400">{item.account}</span>}
      </div>
      <p className="mt-1 text-sm text-zinc-300">{item.detail}</p>
      {item.steps && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-zinc-300">
          {item.steps.map(step => <li key={step}>{step}</li>)}
        </ol>
      )}
    </div>
  );
}
