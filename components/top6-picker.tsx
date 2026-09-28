import { useState, useMemo } from 'react';
import type { NormalizedGame } from '@/lib/types';
import { formatHours } from '@/lib/utils/playtime';

interface Top6PickerProps {
  allGames: NormalizedGame[];
  selectedGames: NormalizedGame[];
  onSelectionChange: (games: NormalizedGame[]) => void;
  disabledAccounts: Set<string>;
  maxGames?: number;
}

export function Top6Picker({ allGames, selectedGames, onSelectionChange, disabledAccounts, maxGames = 6 }: Top6PickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredGames = useMemo(() => {
    if (!searchQuery) return allGames;
    const query = searchQuery.toLowerCase();
    return allGames.filter(g => 
      g.games[0].title.toLowerCase().includes(query)
    );
  }, [allGames, searchQuery]);

  const handleToggleGame = (game: NormalizedGame) => {
    const isSelected = selectedGames.some(g => g.normalizedTitle === game.normalizedTitle);
    
    if (isSelected) {
      onSelectionChange(selectedGames.filter(g => g.normalizedTitle !== game.normalizedTitle));
    } else if (selectedGames.length < maxGames) {
      onSelectionChange([...selectedGames, game]);
    }
  };

  const handleReorder = (fromIndex: number, direction: 'up' | 'down') => {
    const newGames = [...selectedGames];
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    
    if (toIndex < 0 || toIndex >= newGames.length) return;
    
    [newGames[fromIndex], newGames[toIndex]] = [newGames[toIndex], newGames[fromIndex]];
    onSelectionChange(newGames);
  };

  const arrowBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-700 hover:text-white active:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <section aria-label="Choose showcase games" className="card space-y-4 p-4 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">Selected games ({selectedGames.length}/{maxGames})</h3>
        {selectedGames.length === 0 ? (
          <p className="text-zinc-400 text-sm">Select up to {maxGames} games to showcase</p>
        ) : (
          <ol className="space-y-2">
            {selectedGames.map((game, index) => {
              const title = game.games[0].title;
              return (
                <li key={game.normalizedTitle} className="flex items-center gap-2 rounded-lg bg-zinc-800/70 p-2 sm:gap-3">
                  <span className="w-6 shrink-0 text-center text-sm tabular-nums text-zinc-400">{index + 1}</span>
                  {game.coverUrl && (
                    <img src={game.coverUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{title}</div>
                    <div className="text-sm text-zinc-400">
                      {game.playtimeKnown ? formatHours(game.totalPlaytimeMinutes) : 'Playtime unknown'}
                    </div>
                  </div>
                  <button type="button" onClick={() => handleReorder(index, 'up')} disabled={index === 0} className={arrowBtn} aria-label={`Move ${title} up`}>
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button type="button" onClick={() => handleReorder(index, 'down')} disabled={index === selectedGames.length - 1} className={arrowBtn} aria-label={`Move ${title} down`}>
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button type="button" onClick={() => handleToggleGame(game)} className="btn btn-secondary px-3" aria-label={`Remove ${title}`}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Available games</h3>
        <label htmlFor="top6-picker-search" className="sr-only">Search games</label>
        <input
          id="top6-picker-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search games…"
          className="field mb-3 min-h-11 w-full px-4 py-2 text-sm"
        />
        <ul className="max-h-96 space-y-2 overflow-y-auto" aria-label="Available games">
          {filteredGames.map(game => {
            const isSelected = selectedGames.some(g => g.normalizedTitle === game.normalizedTitle);
            const canSelect = selectedGames.length < maxGames;
            const title = game.games[0].title;

            return (
              <li key={game.normalizedTitle}>
                <button
                  type="button"
                  onClick={() => handleToggleGame(game)}
                  disabled={!isSelected && !canSelect}
                  aria-pressed={isSelected}
                  aria-label={`${title}${isSelected ? ', selected' : ''}`}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                    isSelected
                      ? 'border-emerald-500/70 bg-emerald-500/10'
                      : canSelect
                      ? 'border-transparent bg-zinc-800/70 hover:bg-zinc-800 active:bg-zinc-700'
                      : 'cursor-not-allowed border-transparent bg-zinc-800/40 opacity-50'
                  }`}
                >
                  {game.coverUrl && (
                    <img src={game.coverUrl} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{title}</div>
                    <div className="text-sm text-zinc-400">
                      {game.playtimeKnown ? formatHours(game.totalPlaytimeMinutes) : 'Playtime unknown'}
                    </div>
                  </div>
                  {isSelected && (
                    <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
