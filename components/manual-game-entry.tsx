'use client';

import { useState } from 'react';
import type { Platform } from '@/lib/types';

interface ManualGame {
  id: string;
  title: string;
  platform: Platform | 'other';
  playtimeMinutes?: number;
  achievementsEarned?: number;
  achievementsTotal?: number;
  coverUrl?: string;
  lastPlayedAt?: string;
  notes?: string;
}

interface ManualGameEntryProps {
  onAdd: (game: ManualGame) => void;
  onCancel: () => void;
}

export function ManualGameEntry({ onAdd, onCancel }: ManualGameEntryProps) {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<Platform | 'other'>('other');
  const [hours, setHours] = useState('');
  const [achievementsEarned, setAchievementsEarned] = useState('');
  const [achievementsTotal, setAchievementsTotal] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [lastPlayed, setLastPlayed] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Game title is required');
      return;
    }

    const playtimeMinutes = hours ? Math.round(parseFloat(hours) * 60) : undefined;
    const earned = achievementsEarned ? parseInt(achievementsEarned) : undefined;
    const total = achievementsTotal ? parseInt(achievementsTotal) : undefined;

    const game: ManualGame = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      platform,
      playtimeMinutes,
      achievementsEarned: earned,
      achievementsTotal: total,
      coverUrl: coverUrl.trim() || undefined,
      lastPlayedAt: lastPlayed || new Date().toISOString(),
      notes: notes.trim() || undefined,
    };

    onAdd(game);

    // Reset form
    setTitle('');
    setPlatform('other');
    setHours('');
    setAchievementsEarned('');
    setAchievementsTotal('');
    setCoverUrl('');
    setNotes('');
    setLastPlayed('');
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Add Manual Game</h3>
          <p className="text-sm text-zinc-400">Add games not tracked by Xbox/Steam/PSN</p>
        </div>
        <button
          onClick={onCancel}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Game Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Pokemon Red, The Legend of Zelda"
            required
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Platform */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | 'other')}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="other">Other / Manual</option>
            <option value="xbox">Xbox</option>
            <option value="steam">Steam</option>
            <option value="psn">PlayStation</option>
          </select>
          <p className="text-xs text-zinc-400 mt-1">
            Select &quot;Other&quot; for Nintendo, mobile, retro games, etc.
          </p>
        </div>

        {/* Playtime */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Playtime (hours)
          </label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="e.g., 50"
            min="0"
            step="0.5"
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-zinc-400 mt-1">Optional - your best estimate</p>
        </div>

        {/* Achievements */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Achievements Earned
            </label>
            <input
              type="number"
              value={achievementsEarned}
              onChange={(e) => setAchievementsEarned(e.target.value)}
              placeholder="e.g., 15"
              min="0"
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Total Achievements
            </label>
            <input
              type="number"
              value={achievementsTotal}
              onChange={(e) => setAchievementsTotal(e.target.value)}
              placeholder="e.g., 50"
              min="0"
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Cover Image URL */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Cover Image URL
          </label>
          <input
            type="url"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://example.com/cover.jpg"
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-zinc-400 mt-1">
            Optional - paste a direct link to the game&apos;s cover art
          </p>
        </div>

        {/* Last Played */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Last Played
          </label>
          <input
            type="date"
            value={lastPlayed}
            onChange={(e) => setLastPlayed(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-zinc-400 mt-1">Optional - defaults to today</p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Completed on Game Boy, favorite childhood game..."
            rows={3}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
        </div>

        {/* Submit buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 px-4 py-3 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-medium font-medium rounded-lg transition-colors"
          >
            Add Game
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
