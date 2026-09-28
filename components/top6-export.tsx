'use client';

import { useState, useRef } from 'react';
import { exportNodeToImage, downloadBlob } from '@/lib/export/export-image';
import { Top6Grid } from './top6-grid';
import type { NormalizedGame } from '@/lib/types';

interface Top6ExportProps {
  games: NormalizedGame[];
  playerName?: string;
  avatarUrl?: string;
}

function proxyImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export function Top6Export({ games, playerName, avatarUrl }: Top6ExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const gamesWithProxiedImages = games.map(game => ({
    ...game,
    coverUrl: proxyImageUrl(game.coverUrl),
  }));

  const handleExport = async () => {
    if (!gridRef.current) return;

    setIsExporting(true);
    try {
      const result = await exportNodeToImage(gridRef.current, { preferredPixelRatio: 2 });
      downloadBlob(result.blob, `${playerName || 'my'}-top-6-games`);
    } catch (error) {
      console.error('Failed to export image:', error);
      alert('Failed to export image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div ref={gridRef}>
        <Top6Grid 
          games={gamesWithProxiedImages} 
          disabledAccounts={new Set()} 
          playerName={playerName || 'Player'} 
          avatarUrl={avatarUrl} 
        />
      </div>
      
      <div className="text-center">
        <button
          onClick={handleExport}
          disabled={isExporting || games.length !== 6}
          className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          {isExporting ? 'Exporting...' : 'Save as PNG'}
        </button>
      </div>
    </div>
  );
}
