'use client';

import Link from 'next/link';
import {
  accountSetKey,
  accountSetLabel,
  accountSetQuery,
  clearRecentAccountSets,
  forgetCurrentAccountSet,
  removeRecentAccountSet,
  useSavedAccounts,
} from '@/lib/saved-accounts';

/**
 * "Continue with your accounts" card plus the "Recent lookups" list, read from
 * localStorage. Renders nothing for first-time visitors (and during SSR).
 */
export function SavedAccountsPanel({ showRecent = true }: { showRecent?: boolean }) {
  const { current, recent } = useSavedAccounts();
  const currentKey = current ? accountSetKey(current.accounts) : null;
  const otherRecent = recent.filter(s => accountSetKey(s.accounts) !== currentKey);

  if (!current && (!showRecent || otherRecent.length === 0)) return null;

  return (
    <div className="space-y-3" data-testid="saved-accounts">
      {current && (
        <div className="card p-4" data-testid="continue-card">
          <div className="text-sm text-zinc-300">
            Continue with your accounts:{' '}
            <span className="font-medium text-zinc-100 break-words">{accountSetLabel(current)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={`/p?${accountSetQuery(current)}`} className="btn btn-secondary">
              Continue <span aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              onClick={() => forgetCurrentAccountSet()}
              className="btn btn-ghost"
            >
              Forget these accounts
            </button>
          </div>
        </div>
      )}

      {showRecent && otherRecent.length > 0 && (
        <div className="card p-4" data-testid="recent-lookups">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">Recent lookups</h2>
            <button
              type="button"
              onClick={() => clearRecentAccountSets()}
              className="inline-flex min-h-11 items-center px-1 text-xs text-zinc-400 hover:text-zinc-100 transition-colors sm:min-h-8"
            >
              Clear all
            </button>
          </div>
          <ul className="space-y-1">
            {otherRecent.map(set => {
              const key = accountSetKey(set.accounts);
              const label = accountSetLabel(set);
              return (
                <li key={key} className="flex items-center gap-2">
                  <Link
                    href={`/p?${accountSetQuery(set)}`}
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-2.5 text-sm sm:py-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                    title={label}
                  >
                    {label}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeRecentAccountSet(key)}
                    aria-label={`Remove ${label} from recent lookups`}
                    className="flex h-11 w-11 flex-shrink-0 sm:h-8 sm:w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
