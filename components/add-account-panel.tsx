'use client';

import { useState } from 'react';
import { normalizeSteamInput } from '@/lib/utils/steam-parser';
import { normalizeXboxInput, normalizePSNInput } from '@/lib/input-normalizer';
import type { Platform } from '@/lib/types';

interface AddAccountPanelProps {
  onAdd: (platform: Platform, identifier: string) => Promise<void>;
  onCancel: () => void;
  currentAccountCount: number;
  maxAccounts: number;
}

export function AddAccountPanel({ onAdd, onCancel, currentAccountCount, maxAccounts }: AddAccountPanelProps) {
  const [platform, setPlatform] = useState<Platform>('xbox');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) {
      setError('Please enter an account identifier');
      return;
    }

    if (currentAccountCount >= maxAccounts) {
      setError(`Maximum ${maxAccounts} accounts allowed per pool`);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Normalize input based on platform
      let identifier = input.trim();
      
      if (platform === 'steam') {
        const normalized = normalizeSteamInput(input);
        if (normalized) {
          identifier = normalized.value;
        }
      } else if (platform === 'xbox') {
        const result = normalizeXboxInput(input);
        if (result.success && result.identifier) {
          identifier = result.identifier;
        } else if (!result.success) {
          setError(result.error || 'Invalid Xbox gamertag');
          setIsLoading(false);
          return;
        }
      } else if (platform === 'psn') {
        const result = normalizePSNInput(input);
        if (result.success && result.identifier) {
          identifier = result.identifier;
        } else if (!result.success) {
          setError(result.error || 'Invalid PSN ID');
          setIsLoading(false);
          return;
        }
      }

      await onAdd(platform, identifier);
      
      // Success - reset form
      setInput('');
      setPlatform('xbox');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account');
    } finally {
      setIsLoading(false);
    }
  };

  const placeholderText = {
    xbox: 'Gamertag or xbox.com profile URL',
    steam: 'Steam ID or steamcommunity.com URL',
    psn: 'PSN ID or psnprofiles.com URL',
  };

  const remainingSlots = maxAccounts - currentAccountCount;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Add account</h3>
        <button
          onClick={onCancel}
          className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          aria-label="Close"
          disabled={isLoading}
        >
          <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {remainingSlots === 0 && (
        <div className="text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded px-3 py-2">
          Maximum {maxAccounts} accounts reached. Remove an account to add a new one.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <span id="add-account-platform" className="block text-sm text-zinc-400 mb-2">Platform</span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="add-account-platform">
            {(['xbox', 'steam', 'psn'] as Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                onClick={() => setPlatform(p)}
                disabled={isLoading}
                className={`min-h-11 py-2 px-4 rounded-lg capitalize transition-colors ${
                  platform === p
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                } disabled:opacity-50`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="add-account-identifier" className="block text-sm text-zinc-400 mb-2">Account identifier</label>
          <input
            id="add-account-identifier"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholderText[platform]}
            disabled={isLoading || remainingSlots === 0}
            className="field min-h-11 w-full px-4 py-2 disabled:opacity-50"
          />
          <p className="text-xs text-zinc-400 mt-1">
            Paste a profile URL or enter the ID directly
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || !input.trim() || remainingSlots === 0}
            className="btn btn-primary flex-1"
          >
            {isLoading ? 'Adding...' : 'Add Account'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>

        {remainingSlots > 0 && (
          <p className="text-xs text-zinc-400 text-center">
            {remainingSlots} {remainingSlots === 1 ? 'slot' : 'slots'} remaining
          </p>
        )}
      </form>
    </div>
  );
}
