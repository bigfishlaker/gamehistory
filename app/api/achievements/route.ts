import { NextRequest, NextResponse } from 'next/server';
import { createXboxAdapter, createSteamAdapter } from '@/lib/adapters';
import { getCache } from '@/lib/cache';
import { reviveAchievementArrayDates } from '@/lib/utils/date-reviver';
import { enforceRateLimit, dedupe, BUSY_MESSAGE } from '@/lib/rate-limit';
import { validateAchievementsQuery } from '@/lib/validators';
import { userSafeError } from '@/lib/utils/safe-error';
import type { Achievement } from '@/lib/types';

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'achievements');
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const playerId = searchParams.get('playerId');
  const gameId = searchParams.get('gameId');

  const validation = validateAchievementsQuery(platform, playerId, gameId);
  if (!validation.valid || !platform || !playerId || !gameId) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const cache = getCache();
  const cacheKey = `achievements:${platform}:${playerId}:${gameId}`;
  
  const cached = await cache.get<Achievement[]>(cacheKey);
  if (cached) {
    return NextResponse.json({ achievements: reviveAchievementArrayDates(cached) });
  }

  const { achievements, error, busy } = await dedupe(cacheKey, async () => {
    let achievements: Achievement[] = [];
    let error: string | null = null;
    let busy = false;

    if (platform === 'xbox') {
      const xbox = createXboxAdapter();
      if (!xbox) {
        error = 'Xbox API key not configured';
      } else {
        const result = await xbox.getGameAchievements(playerId, gameId);
        if (result.success) {
          achievements = result.data;
          await cache.set(cacheKey, achievements, 24 * 60 * 60);
        } else {
          error = result.error.code === 'BUDGET_EXHAUSTED' ? (result.error.message || BUSY_MESSAGE) : userSafeError(result.error.message || result.error.error);
          busy = result.error.code === 'BUDGET_EXHAUSTED';
        }
      }
    } else if (platform === 'steam') {
      const steam = createSteamAdapter();
      if (!steam) {
        error = 'Steam API key not configured';
      } else {
        const result = await steam.getGameAchievements(playerId, gameId);
        if (result.success) {
          achievements = result.data;
          await cache.set(cacheKey, achievements, 24 * 60 * 60);
        } else {
          error = result.error.code === 'BUDGET_EXHAUSTED' ? (result.error.message || BUSY_MESSAGE) : userSafeError(result.error.message || result.error.error);
          busy = result.error.code === 'BUDGET_EXHAUSTED';
        }
      }
    } else {
      error = `Unsupported platform: ${platform}`;
    }

    return { achievements, error, busy };
  });

  if (error) {
    return NextResponse.json(busy ? { error, busy: true } : { error }, { status: busy ? 503 : 400 });
  }

  return NextResponse.json({ achievements });
}
