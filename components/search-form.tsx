'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformHelpModal } from './platform-help-modal';
import { normalizeSteamInput } from '@/lib/utils/steam-parser';
import { normalizeEpicInput } from '@/lib/fortnite';
import type { Platform } from '@/lib/types';
import { usePendingAccounts, setPendingAccounts } from '@/lib/saved-accounts';

interface Account {
  platform: 'xbox' | 'steam' | 'psn' | 'epic';
  identifier: string;
}

export function SearchForm() {
  const router = useRouter();
  // Added-but-not-submitted accounts live in sessionStorage so they survive Back/refresh.
  const accounts: Account[] = usePendingAccounts();
  const setAccounts = (next: Account[]) => setPendingAccounts(next);
  const [platform, setPlatform] = useState<Account['platform']>('xbox');
  const [identifier, setIdentifier] = useState('');
  const [helpPlatform, setHelpPlatform] = useState<Platform | null>(null);

  // Send the Steam ID64 / vanity name rather than a pasted profile URL. Unrecognized
  // input is passed through; the API answers with a friendly error.
  const clean = (p: Account['platform'], value: string) =>
    p === 'steam' ? normalizeSteamInput(value)?.value ?? value.trim() : p === 'epic' ? normalizeEpicInput(value) : value.trim();

  const handleAdd = () => {
    if (!identifier.trim()) return;
    setAccounts([...accounts, { platform, identifier: clean(platform, identifier) }]);
    setIdentifier('');
  };

  const handleRemove = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (accounts.length === 0 && !identifier.trim()) {
      return;
    }

    const allAccounts = identifier.trim()
      ? [...accounts, { platform, identifier: clean(platform, identifier) }]
      : accounts;

    const params = new URLSearchParams();
    allAccounts.forEach(acc => {
      params.append(acc.platform, acc.identifier);
    });
    
    setPendingAccounts([]);
    router.push(`/p?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">
      <div className={accounts.length ? 'space-y-2' : 'hidden'}>
        {accounts.map((acc, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
            <span className="w-12 text-xs text-zinc-400 uppercase">{acc.platform}</span>
            <span className="flex-1 text-zinc-100">{acc.identifier}</span>
            <button
              type="button"
              onClick={() => handleRemove(i)}
              aria-label={`Remove ${acc.identifier}`}
              className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors sm:h-8 sm:w-8"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Account['platform'])}
            aria-label="Platform"
            className="field min-h-11 px-3 py-2.5 text-sm"
          >
            <option value="xbox">Xbox</option>
            <option value="steam">Steam</option>
            <option value="psn">PSN</option>
            <option value="epic">Epic / Fortnite</option>
          </select>
          <div className="flex-1 min-w-0 relative">
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={
                platform === 'xbox' ? 'Gamertag' 
                : platform === 'steam' ? 'Steam ID or profile URL'
                : platform === 'epic' ? 'Epic display name'
                : 'PSN Online ID'
              }
              aria-label="Account ID"
              className="field min-h-11 w-full pl-3 pr-12 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => setHelpPlatform(platform)}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors flex items-center justify-center text-xs"
              title={`How to find your ${platform.toUpperCase()} ID`}
            >
              ?
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!identifier.trim()}
            className="btn btn-secondary py-2.5"
          >
            Add
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={accounts.length === 0 && !identifier.trim()}
        className="btn btn-primary w-full py-2.5"
      >
        View Profile
      </button>

      {/* Help Modal */}
      <PlatformHelpModal
        platform={helpPlatform || 'steam'}
        isOpen={helpPlatform !== null}
        onClose={() => setHelpPlatform(null)}
      />
    </form>
  );
}
