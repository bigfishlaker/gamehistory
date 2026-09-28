'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { NormalizedGame } from '@/lib/types';
import { PlaytimeInfoTooltip } from './playtime-info-tooltip';

interface GameCardProps {
  game: NormalizedGame;
  onClick?: () => void;
}

const platformIcons = {
  xbox: 'Xbox',
  steam: 'Steam',
  psn: 'PSN',
  epic: 'Epic',
};

export function GameCard({ game, onClick }: GameCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState(game.coverUrl);
  
  const completionPercent = game.achievementProgress.total > 0
    ? Math.round((game.achievementProgress.earned / game.achievementProgress.total) * 100)
    : null;

  // Check if this is a legacy Xbox 360 game (Xbox platform with no playtime)
  const isLegacyXbox = game.games.some(g => 
    g.platform === 'xbox' && g.playtimeMinutes === undefined
  );

  const formatPlaytime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 1000 ? `${hours}h` : `${Math.round(hours / 100) / 10}k h`;
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  };

  const handleImageError = () => {
    // For Steam games, try header.jpg fallback when library_600x900_2x.jpg fails
    if (game.games[0].platform === 'steam' && imageUrl?.includes('library_600x900_2x.jpg')) {
      const appId = game.games[0].id;
      setImageUrl(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`);
    } else {
      setImageError(true);
    }
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${game.games[0].title}: show achievements` : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 active:border-zinc-600 transition-colors cursor-pointer group"
    >
      <div className="aspect-[2/3] bg-zinc-950 relative overflow-hidden">
        {imageUrl && !imageError ? (
          game.games[0].platform === 'xbox' ? (
            <div className="w-full h-full relative">
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
              <Image
                src={imageUrl}
                alt={game.games[0].title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                className="object-contain p-4 group-hover:scale-105 transition-transform"
                onError={handleImageError}
              />
            </div>
          ) : (
            <Image
              src={imageUrl}
              alt={game.games[0].title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
              className="object-cover group-hover:scale-105 transition-transform"
              onError={handleImageError}
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center px-3 text-center text-xs text-zinc-400">
            {game.games[0].title}
          </div>
        )}
        
        {completionPercent !== null && completionPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <div className="flex items-center justify-between text-xs text-white">
              <span>{completionPercent}%</span>
              <span>{game.achievementProgress.earned}/{game.achievementProgress.total}</span>
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-1">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
      
      <div className="p-3">
        <h3 className="text-sm font-medium text-zinc-100 truncate" title={game.games[0].title}>
          {game.games[0].title}
        </h3>
        
        <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
          {game.games.map((g) => (
            <span key={`${g.platform}-${g.accountId ?? ''}-${g.id}`} className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{platformIcons[g.platform]}</span>
          ))}
        </div>
        
        <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
          <span
            className="flex items-center gap-1"
            title={
              game.playtimeKnown
                ? game.games
                    .map(g => `${g.platform}: ${g.playtimeMinutes === undefined ? 'unknown' : formatPlaytime(g.playtimeMinutes)}`)
                    .join(' · ')
                : 'No playtime data from this platform'
            }
          >
            {game.playtimeKnown ? formatPlaytime(game.totalPlaytimeMinutes) : (
              <span className="flex items-center gap-1">
                Playtime unknown
                <PlaytimeInfoTooltip isLegacy={isLegacyXbox} />
              </span>
            )}
          </span>
          {new Date(game.lastPlayedAt ?? 0).getTime() > 0 && (
            <span>{formatDate(new Date(game.lastPlayedAt ?? 0))}</span>
          )}
        </div>

        {game.games.length > 1 && game.playtimeKnown && (
          <div className="mt-1 text-[11px] text-zinc-400">
            {game.games.map(g => (
              <span key={`pt-${g.platform}-${g.accountId ?? ''}-${g.id}`} className="mr-2">
                {platformIcons[g.platform]} {g.playtimeMinutes === undefined ? '?' : formatPlaytime(g.playtimeMinutes)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
