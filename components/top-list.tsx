'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { exportNodeToImage, downloadBlob } from '@/lib/export/export-image';
import type { NormalizedGame, Platform } from '@/lib/types';
import { formatHours } from '@/lib/utils/playtime';
import { sortGames } from '@/lib/utils/title-merger';

interface TopListProps {
  games: NormalizedGame[];
  playerName?: string;
  avatarUrl?: string;
}

type ListSize = 10 | 25 | 50;
type Metric = 'playtime' | 'achievements';

const platformNames: Record<Platform, string> = { xbox: 'Xbox', steam: 'Steam', psn: 'PlayStation', epic: 'Epic' };

export function TopList({ games, playerName, avatarUrl }: TopListProps) {
  const [size, setSize] = useState<ListSize>(10);
  const [metric, setMetric] = useState<Metric>('playtime');
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  // Playtime uses the shared "Most played (combined)" sort, which puts games with
  // unknown playtime after every game with known playtime.
  const sortedGames = metric === 'playtime'
    ? sortGames(games, 'playtime')
    : sortGames(games, 'completion');

  const orderedGames = customOrder.length > 0
    ? customOrder.map(title => games.find(g => g.normalizedTitle === title)).filter(g => g !== undefined)
    : sortedGames;

  const topGames = orderedGames.slice(0, size);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...(customOrder.length > 0 ? customOrder : sortedGames.map(g => g.normalizedTitle))];
    const draggedItem = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);

    setCustomOrder(newOrder);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleExportPng = async () => {
    if (!listRef.current) return;

    setIsExporting(true);
    setExportNote(null);
    try {
      // Images go through /api/image and are decoded first (the avatar used to be
      // loaded cross-origin, which aborts html-to-image); a Top 50 list is ~6000px
      // tall, so the pixel ratio is clamped to the canvas budget.
      const result = await exportNodeToImage(listRef.current, { preferredPixelRatio: 2, backgroundColor: '#111827' });
      downloadBlob(result.blob, `${(playerName || 'player').toLowerCase().replace(/\s+/g, '-')}-top-${size}-games`);
      if (result.failedImages > 0) setExportNote(`${result.failedImages} image(s) could not be loaded and were replaced with a title card.`);
    } catch (error) {
      console.error('Failed to export PNG:', error);
      setExportNote('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {([10, 25, 50] as ListSize[]).map(s => (
            <button
              key={s}
              type="button"
              aria-pressed={size === s}
              onClick={() => setSize(s)}
              className={`min-h-11 px-4 py-2 rounded-lg font-medium transition-colors ${
                size === s
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Top {s}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={metric === 'playtime'}
            onClick={() => setMetric('playtime')}
            className={`min-h-11 px-4 py-2 rounded-lg font-medium transition-colors ${
              metric === 'playtime'
                ? 'bg-zinc-100 text-zinc-950'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Playtime
          </button>
          <button
            type="button"
            aria-pressed={metric === 'achievements'}
            onClick={() => setMetric('achievements')}
            className={`min-h-11 px-4 py-2 rounded-lg font-medium transition-colors ${
              metric === 'achievements'
                ? 'bg-zinc-100 text-zinc-950'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Achievements
          </button>
        </div>

        <button
          onClick={handleExportPng}
          disabled={isExporting}
          data-export="toplist"
          className="btn btn-primary"
        >
          {isExporting ? 'Exporting...' : 'Save as PNG'}
        </button>
      </div>

      {exportNote && <p className="text-sm text-amber-400">{exportNote}</p>}

      <div ref={listRef} className="bg-gray-900 p-8 rounded-lg">
        {playerName && (
          <div className="flex items-center gap-4 mb-6">
            {avatarUrl && (
              <img src={avatarUrl} alt={playerName} className="w-16 h-16 rounded-full object-cover" />
            )}
            <div>
              <h2 className="text-3xl font-bold text-white">{playerName}</h2>
              <p className="text-zinc-400">Top {size} Games</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {topGames.map((game, index) => {
            const progressPercent = game.achievementProgress.total > 0
              ? Math.round((game.achievementProgress.earned / game.achievementProgress.total) * 100)
              : 0;

            return (
              <div
                key={game.normalizedTitle}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-4 bg-gray-800 p-4 rounded-lg cursor-move hover:bg-gray-750 transition-colors"
              >
                <div className="text-2xl font-bold text-gray-400 w-12 text-right">
                  {index + 1}
                </div>

                {game.coverUrl && (
                  <div className="relative w-16 h-24 flex-shrink-0 rounded overflow-hidden bg-gray-700">
                    <Image
                      src={game.coverUrl.startsWith('http') ? `/api/image?url=${encodeURIComponent(game.coverUrl)}` : game.coverUrl}
                      alt={game.games[0].title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white truncate">
                    {game.games[0].title}
                  </h3>
                  <div className="flex gap-2 text-sm text-zinc-400">
                    {/* One label per platform: the same title on two accounts (or two
                        titleIds, e.g. both Fortnite entries) printed "Xbox Xbox" and
                        produced duplicate React keys. */}
                    {Array.from(new Set(game.games.map(g => g.platform))).map(platform => (
                      <span key={platform} className="capitalize">
                        {platformNames[platform]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-6 text-right">
                  {metric === 'playtime' && (
                    <div>
                      <div className="text-xl font-bold text-white">
                        {game.playtimeKnown ? formatHours(game.totalPlaytimeMinutes) : 'Unknown'}
                      </div>
                      <div className="text-xs text-zinc-400">Playtime</div>
                    </div>
                  )}

                  <div>
                    <div className="text-xl font-bold text-white">
                      {/* total 0 means the platform didn't report a total (Steam library
                          never includes counts; newer Xbox titles report 0), not "no achievements". */}
                      {game.achievementProgress.total > 0
                        ? `${progressPercent}%`
                        : game.achievementProgress.earned > 0
                          ? game.achievementProgress.earned
                          : '—'}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {game.achievementProgress.total > 0
                        ? `${game.achievementProgress.earned}/${game.achievementProgress.total}`
                        : game.achievementProgress.earned > 0
                          ? 'Achievements unlocked'
                          : 'Achievements n/a'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {customOrder.length > 0 && (
        <button
          onClick={() => setCustomOrder([])}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Reset to default order
        </button>
      )}
    </div>
  );
}
