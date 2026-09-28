'use client';

import { useState } from 'react';
import type { ManualGame } from '@/lib/manual-games';

interface ManualGameListProps {
  games: ManualGame[];
  onDelete: (gameId: string) => void;
}

export function ManualGameList({ games, onDelete }: ManualGameListProps) {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const toggleNotes = (gameId: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(gameId)) {
      newExpanded.delete(gameId);
    } else {
      newExpanded.add(gameId);
    }
    setExpandedNotes(newExpanded);
  };

  if (games.length === 0) {
    return null;
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-zinc-300">
          Manual Games ({games.length})
        </h4>
        <div className="text-xs text-zinc-400">
          Games you added manually
        </div>
      </div>

      <div className="space-y-2">
        {games.map((game) => (
          <div
            key={game.id}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h5 className="font-medium text-white truncate">{game.title}</h5>
                  {game.platform === 'other' ? (
                    <span className="px-1.5 py-0.5 border border-zinc-800 text-zinc-400 text-xs rounded">
                      Manual
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded capitalize">
                      {game.platform}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                  {game.playtimeMinutes !== undefined && (
                    <span>
                      {Math.floor(game.playtimeMinutes / 60)}h playtime
                    </span>
                  )}
                  {game.achievementsTotal !== undefined && game.achievementsTotal > 0 && (
                    <span>
                      {game.achievementsEarned ?? 0}/{game.achievementsTotal} achievements
                    </span>
                  )}
                  {game.lastPlayedAt && (
                    <span>
                      Last played: {new Date(game.lastPlayedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {game.notes && (
                  <div className="mt-2">
                    {expandedNotes.has(game.id) ? (
                      <div className="text-xs text-zinc-400 bg-zinc-950 rounded px-2 py-1">
                        {game.notes}
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleNotes(game.id)}
                        className="text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-100"
                      >
                        Show notes
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {game.notes && expandedNotes.has(game.id) && (
                  <button
                    onClick={() => toggleNotes(game.id)}
                    className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
                    title="Hide notes"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm(`Remove "${game.title}" from your library?`)) {
                      onDelete(game.id);
                    }
                  }}
                  className="p-1 text-zinc-400 hover:text-red-400 transition-colors"
                  title="Remove game"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
