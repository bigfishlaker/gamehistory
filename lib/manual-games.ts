import type { Game, NormalizedGame, Platform } from './types';

export interface ManualGame {
  id: string;
  title: string;
  platform: Platform | 'other';
  playtimeMinutes?: number;
  achievementsEarned?: number;
  achievementsTotal?: number;
  coverUrl?: string;
  lastPlayedAt?: string;
  notes?: string;
  addedAt: string;
}

const STORAGE_KEY = 'manual-games';

export function getManualGames(): ManualGame[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load manual games:', error);
    return [];
  }
}

export function saveManualGame(game: Omit<ManualGame, 'addedAt'>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const games = getManualGames();
    const newGame: ManualGame = {
      ...game,
      addedAt: new Date().toISOString(),
    };
    games.push(newGame);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch (error) {
    console.error('Failed to save manual game:', error);
    throw error;
  }
}

export function deleteManualGame(gameId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const games = getManualGames();
    const filtered = games.filter(g => g.id !== gameId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete manual game:', error);
    throw error;
  }
}

export function updateManualGame(gameId: string, updates: Partial<ManualGame>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const games = getManualGames();
    const index = games.findIndex(g => g.id === gameId);
    if (index === -1) return;
    
    games[index] = { ...games[index], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch (error) {
    console.error('Failed to update manual game:', error);
    throw error;
  }
}

// Convert a ManualGame to the Game format used by the app
export function manualGameToGame(manualGame: ManualGame): Game {
  return {
    id: manualGame.id,
    title: manualGame.title,
    platform: manualGame.platform === 'other' ? 'xbox' as Platform : manualGame.platform, // Use xbox as fallback
    coverUrl: manualGame.coverUrl,
    playtimeMinutes: manualGame.playtimeMinutes,
    lastPlayedAt: manualGame.lastPlayedAt ? new Date(manualGame.lastPlayedAt) : undefined,
    achievementProgress: {
      earned: manualGame.achievementsEarned ?? 0,
      total: manualGame.achievementsTotal ?? 0,
    },
    accountId: 'manual',
  };
}

// Check if a game is a manual game
export function isManualGame(game: Game): boolean {
  return game.accountId === 'manual' || game.id.startsWith('manual-');
}
