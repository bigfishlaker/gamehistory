'use client';

import { useState } from 'react';
import { GameCard } from './game-card';
import { Top6Grid } from './top6-grid';
import type { NormalizedGame } from '@/lib/types';

interface Top6SelectorProps {
  availableGames: NormalizedGame[];
  initialSelection: NormalizedGame[];
  playerName?: string;
  onSelectionChange: (games: NormalizedGame[]) => void;
}

export function Top6Selector({ availableGames, initialSelection, playerName, onSelectionChange }: Top6SelectorProps) {
  const [selectedGames, setSelectedGames] = useState<NormalizedGame[]>(initialSelection);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleGameClick = (game: NormalizedGame) => {
    if (selectedGames.length < 6 && !selectedGames.find(g => g.normalizedTitle === game.normalizedTitle)) {
      const newSelection = [...selectedGames, game];
      setSelectedGames(newSelection);
      onSelectionChange(newSelection);
    }
  };

  const handleRemove = (index: number) => {
    const newSelection = selectedGames.filter((_, i) => i !== index);
    setSelectedGames(newSelection);
    onSelectionChange(newSelection);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSelection = [...selectedGames];
    const draggedItem = newSelection[draggedIndex];
    newSelection.splice(draggedIndex, 1);
    newSelection.splice(index, 0, draggedItem);
    
    setSelectedGames(newSelection);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    onSelectionChange(selectedGames);
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-white">Your Top 6</h3>
          <span className="text-zinc-400 text-sm">{selectedGames.length}/6 selected</span>
        </div>

        {selectedGames.length === 6 ? (
          <Top6Grid 
            games={selectedGames} 
            disabledAccounts={new Set()} 
            playerName={playerName || 'Player'} 
            avatarUrl={undefined} 
          />
        ) : (
          <div className="grid grid-cols-3 gap-4 min-h-[200px]">
            {Array.from({ length: 6 }).map((_, index) => {
              const game = selectedGames[index];
              return (
                <div
                  key={index}
                  draggable={!!game}
                  onDragStart={() => game && handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`aspect-[2/3] bg-zinc-950 border rounded-lg border-dashed ${
                    game ? 'border-zinc-700 cursor-move' : 'border-zinc-800'
                  } flex items-center justify-center relative group`}
                >
                  {game ? (
                    <>
                      <div className="absolute inset-0">
                        <GameCard game={game} onClick={() => {}} />
                      </div>
                      <button
                        onClick={() => handleRemove(index)}
                        className="absolute top-2 right-2 z-10 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div className="text-zinc-400 text-center p-4">
                      <div className="text-3xl mb-2">+</div>
                      <div className="text-xs">Click a game below</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold text-white mb-4">Select Games</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {availableGames.map((game, i) => {
            const isSelected = selectedGames.find(g => g.normalizedTitle === game.normalizedTitle);
            return (
              <div
                key={`${game.normalizedTitle}-${i}`}
                className={`relative ${isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={() => !isSelected && handleGameClick(game)}
              >
                <GameCard game={game} onClick={() => {}} />
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                    <span className="text-white text-2xl">✓</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
