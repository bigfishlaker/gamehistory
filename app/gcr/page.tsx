'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEMO_ACCOUNTS, getDemoLabel } from '@/lib/demo-accounts';
import {
  accountSetQuery,
  accountsFromParams,
  forgetCurrentAccountSet,
  getCurrentAccountSet,
  saveAccountSet,
  withDisplayNames,
} from '@/lib/saved-accounts';
import { mergeGames } from '@/lib/utils/title-merger';
import { formatHours } from '@/lib/utils/playtime';
import { reviveGameArrayDates } from '@/lib/utils/date-reviver';
import type { PlayerProfile, Game, Platform, NormalizedGame } from '@/lib/types';
import { AccountErrors } from '@/components/account-errors';
import { DashboardSkeleton } from '@/components/skeletons';

interface ProfileData {
  profiles: PlayerProfile[];
  games: Game[];
  errors: Record<string, string>;
}

interface SharedGame extends NormalizedGame {
  accountCount: number;
  accountDetails: Array<{
    profile: PlayerProfile;
    /** null = playtime unknown (e.g. Xbox 360 titles), never shown as 0. */
    hours: number | null;
  }>;
}

// The dashboard reads its accounts from the URL once per mount, so remount it whenever the
// accounts in the URL change (e.g. Example -> Dashboard in the header, or Back/Forward).
function DashboardKeyed() {
  const searchParams = useSearchParams();
  const key = searchParams.get('example') === '1'
    ? 'example'
    : `${accountSetQuery({ accounts: accountsFromParams(searchParams), off: [] })}|${searchParams.get('off') ?? ''}`;
  return <DashboardContent key={key} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardKeyed />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  // No accounts in the URL (and none saved) = empty state. The example loads only with ?example=1.
  const [noAccounts, setNoAccounts] = useState(false);
  const [isExample, setIsExample] = useState(false);
  // Same account query string, used to link to the matching profile page (/p).
  const [profileQuery, setProfileQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const query = new URLSearchParams(window.location.search);
      const params = new URLSearchParams();
      if (query.get('example') === '1') {
        setIsExample(true);
        for (const account of DEMO_ACCOUNTS) {
          params.append(account.platform, account.identifier);
        }
      } else {
        for (const platform of ['xbox', 'steam', 'psn'] as const) {
          for (const id of query.getAll(platform)) {
            if (id.trim()) params.append(platform, id.trim());
          }
        }
      }
      const off = isExampleQuery(query) ? '' : (query.get('off') ?? '');
      if ([...params.keys()].length === 0) {
        // No accounts in the URL: restore the visitor's saved accounts, if any. Putting them
        // in the URL remounts this page (see DashboardKeyed), which then loads them once.
        const saved = getCurrentAccountSet();
        if (saved) {
          router.replace(`/dashboard?${accountSetQuery(saved)}`, { scroll: false });
          return;
        }
        setNoAccounts(true);
        setLoading(false);
        return;
      }
      const profileParams = new URLSearchParams(params);
      if (off) profileParams.set('off', off);
      if (isExampleQuery(query)) profileParams.set('example', '1');
      setProfileQuery(profileParams.toString());

      try {
        const response = await fetch(`/api/profile?${params.toString()}`);
        const result = await response.json();
        // JSON has ISO strings, not Dates: revive them before sort()/getTime() (the page
        // crashed with "b.lastPlayedAt.getTime is not a function"). A 429/500 body has
        // no games array, so treat it as a load failure instead of crashing.
        if (!response.ok || !Array.isArray(result?.games)) {
          setLoadError(
            response.status === 429
              ? 'Too many lookups from this network. Please wait a few minutes and try again.'
              : (typeof result?.error === 'string' && result.error) || 'These accounts could not be loaded right now. Please try again shortly.'
          );
        }
        if (response.ok && Array.isArray(result?.games)) {
          setData({ ...result, games: reviveGameArrayDates(result.games) });
          // Remember the visitor's own accounts (browser only). Never the example.
          if (!isExampleQuery(query) && Array.isArray(result?.profiles)) {
            saveAccountSet(withDisplayNames(accountsFromParams(params), result.profiles), off ? off.split(',') : []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setLoadError('Could not reach GAMER.ID. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (loading) return <DashboardSkeleton />;

  if (noAccounts) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white mb-3">Your dashboard</h1>
            <p className="text-sm leading-relaxed text-zinc-400 mb-6">
              Look up your Xbox, Steam and PSN accounts to see pooled hours, shared games and a leaderboard across all of them.
            </p>
            <Link href="/" className="btn btn-primary">
              Look up your accounts
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md text-center" role="alert">
          <h1 className="text-lg font-semibold text-white">Couldn&apos;t load the dashboard</h1>
          <p className="mt-2 text-sm text-zinc-400">{loadError ?? 'Please try again shortly.'}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
            <Link href="/" className="btn btn-secondary">Look up accounts</Link>
          </div>
        </div>
      </div>
    );
  }

  if (data.profiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-lg font-semibold text-white">These accounts couldn&apos;t be loaded</h1>
          <AccountErrors errors={data.errors} className="mt-4" />
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Try again</button>
            <Link href="/" className="btn btn-primary">Look up accounts</Link>
          </div>
        </div>
      </div>
    );
  }

  const mergedGames = mergeGames(data.games);
  
  // Calculate shared games
  const sharedGames: SharedGame[] = mergedGames
    .filter(g => g.games.length >= 2)
    .map(g => {
      const accountDetails = g.games.map(game => {
        const profile = data.profiles.find(p => p.id === game.accountId)!;
        return {
          profile,
          hours: game.playtimeMinutes === undefined || game.playtimeMinutes === null ? null : game.playtimeMinutes / 60,
        };
      });
      
      return {
        ...g,
        accountCount: g.games.length,
        accountDetails,
      };
    })
    .sort((a, b) => {
      if (a.accountCount !== b.accountCount) return b.accountCount - a.accountCount;
      return b.totalPlaytimeMinutes - a.totalPlaytimeMinutes;
    });

  // Calculate stats
  const totalHours = data.games.reduce((sum, g) => sum + (g.playtimeMinutes || 0), 0) / 60;
  const totalGames = mergedGames.length;
  const totalAchievements = mergedGames.reduce((sum, g) => sum + g.achievementProgress.earned, 0);
  
  // Per-platform stats
  const platformStats = data.profiles.reduce((acc, profile) => {
    const platformGames = data.games.filter(g => g.accountId === profile.id);
    const hours = platformGames.reduce((sum, g) => sum + (g.playtimeMinutes || 0), 0) / 60;
    const games = platformGames.length;
    
    if (!acc[profile.platform]) {
      acc[profile.platform] = { hours: 0, games: 0 };
    }
    acc[profile.platform].hours += hours;
    acc[profile.platform].games += games;
    
    return acc;
  }, {} as Record<Platform, { hours: number; games: number }>);

  // Per-account stats
  const accountStats = data.profiles.map(profile => {
    const accountGames = data.games.filter(g => g.accountId === profile.id);
    const knownGames = accountGames.filter(g => g.playtimeMinutes !== undefined && g.playtimeMinutes !== null);
    // No playtime data at all (e.g. an all-Xbox 360 account) is "unknown", not 0h.
    const hours: number | null = knownGames.length > 0 ? knownGames.reduce((sum, g) => sum + (g.playtimeMinutes ?? 0), 0) / 60 : null;
    const achievements = accountGames.reduce((sum, g) => sum + (g.achievementProgress?.earned || 0), 0);
    const uniqueGames = accountGames.filter(g => {
      const normalized = mergedGames.find(mg => mg.normalizedTitle === g.title.toLowerCase().trim());
      return normalized && normalized.games.length === 1;
    }).length;
    
    return {
      profile,
      hours,
      games: accountGames.length,
      achievements,
      uniqueGames,
      hoursPercent: totalHours > 0 && hours !== null ? (hours / totalHours) * 100 : 0,
    };
  }).sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1));

  // Most played overall
  const mostPlayedOverall = mergedGames
    .filter(g => g.playtimeKnown)
    .sort((a, b) => b.totalPlaytimeMinutes - a.totalPlaytimeMinutes)
    .slice(0, 10);

  // Recently played
  const recentlyPlayed = mergedGames
    .filter(g => g.lastPlayedAt)
    .sort((a, b) => b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime())
    .slice(0, 10);

  return (
    <div className="flex-1 text-zinc-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Errors */}
        <AccountErrors errors={data.errors} className="mb-6" />

        {/* Title */}
        <div className="mb-8">
          {isExample && (
            <p className="mb-2 text-sm text-zinc-400">
              {getDemoLabel()}.{' '}
              <Link href="/" className="text-link">Look up your own</Link>
            </p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight mb-2">{isExample ? 'Example dashboard' : 'Dashboard'}</h1>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-zinc-400">
              Analytics for {data.profiles.length} pooled account{data.profiles.length === 1 ? '' : 's'} across {Object.keys(platformStats).length} platform{Object.keys(platformStats).length === 1 ? '' : 's'}
              {!isExample && (
                <button
                  type="button"
                  onClick={() => {
                    forgetCurrentAccountSet();
                    router.push('/dashboard');
                  }}
                  className="ml-3 inline-flex min-h-11 items-center text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline active:text-zinc-300 sm:min-h-0"
                >
                  Forget these accounts
                </button>
              )}
            </p>
            {profileQuery && (
              <div className="flex flex-wrap items-center gap-2">
                <nav aria-label="Profile views" className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/40 p-0.5 text-sm">
                  <Link
                    href={`/p?${profileQuery}`}
                    className="inline-flex min-h-11 items-center rounded px-3 sm:min-h-10 font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    Profile
                  </Link>
                  <span className="inline-flex min-h-11 items-center rounded px-3 sm:min-h-10 font-medium text-zinc-100 bg-zinc-800" aria-current="page">Dashboard</span>
                </nav>
                <Link href={`/p?${profileQuery}&tab=top6`} className="btn btn-primary">
                  Top 6 showcase
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Pooled Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card p-5">
            <div className="text-sm text-zinc-400 mb-1">Total Hours</div>
            <div className="text-2xl font-semibold tabular-nums">{formatHours(totalHours * 60)}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-zinc-400 mb-1">Games</div>
            <div className="text-2xl font-semibold tabular-nums">{totalGames}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-zinc-400 mb-1">Achievements</div>
            <div className="text-2xl font-semibold tabular-nums">{totalAchievements}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-zinc-400 mb-1">Accounts</div>
            <div className="text-2xl font-semibold tabular-nums">{data.profiles.length}</div>
          </div>
        </div>

        {/* Per-Account Hours Breakdown */}
        <div className="card p-5 mb-8">
          <h2 className="text-base font-semibold mb-4">Hours by Account</h2>
          <div className="space-y-3">
            {accountStats.map(stat => (
              <div key={stat.profile.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-white font-medium">{stat.profile.displayName}</span>
                  <span className="text-zinc-400">{stat.hours === null ? 'Playtime unknown' : `${stat.hours.toFixed(1)}h (${stat.hoursPercent.toFixed(1)}%)`}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${stat.hoursPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Platform Split */}
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-4">Platform Split</h2>
            <div className="space-y-4">
              {Object.entries(platformStats).map(([platform, stats]) => (
                <div key={platform}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-white font-medium capitalize">{platform}</span>
                    <span className="text-zinc-400">{formatHours(stats.hours * 60)} • {stats.games} games</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${totalHours > 0 ? (stats.hours / totalHours) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shared Games Count */}
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-4">Shared Games</h2>
            <div className="text-3xl font-semibold tabular-nums mb-2">{sharedGames.length}</div>
            <div className="text-sm text-zinc-400 mb-4">
              Titles found on 2+ accounts after merging
            </div>
            <div className="space-y-2">
              {[5, 4, 3, 2].map(count => {
                const gamesAtCount = sharedGames.filter(g => g.accountCount === count).length;
                if (gamesAtCount === 0) return null;
                return (
                  <div key={count} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">On {count} accounts:</span>
                    <span className="text-white font-medium">{gamesAtCount}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Shared Games Table */}
        <div className="card p-5 mb-8">
          <h2 className="text-base font-semibold mb-4">Top Shared Games</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-zinc-800">
                <tr className="text-left text-sm text-zinc-400">
                  <th className="pb-3 font-medium">Game</th>
                  <th className="pb-3 font-medium">Accounts</th>
                  <th className="pb-3 font-medium text-right">Combined Hours</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {sharedGames.slice(0, 10).map((game, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="py-3">
                      <div className="font-medium text-white">{game.games[0]?.title ?? game.normalizedTitle}</div>
                      <div className="text-xs text-zinc-400 mt-1">
                        {game.accountDetails.map(d => `${d.profile.displayName}: ${d.hours === null ? 'unknown' : `${d.hours.toFixed(1)}h`}`).join(' • ')}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="tabular-nums text-zinc-300">
                        {game.accountCount}
                      </span>
                    </td>
                    <td className="py-3 text-right font-medium text-white">
                      {formatHours(game.totalPlaytimeMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card p-5 mb-8">
          <h2 className="text-base font-semibold mb-4">Account Leaderboard</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-zinc-800">
                <tr className="text-left text-sm text-zinc-400">
                  <th className="pb-3 font-medium">Rank</th>
                  <th className="pb-3 font-medium">Account</th>
                  <th className="pb-3 font-medium text-right">Hours</th>
                  <th className="pb-3 font-medium text-right">Games</th>
                  <th className="pb-3 font-medium text-right">Achievements</th>
                  <th className="pb-3 font-medium text-right">Unique</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {accountStats.map((stat, i) => (
                  <tr key={stat.profile.id} className="border-b border-zinc-800/50">
                    <td className="py-3">
                      <div className="w-7 h-7 rounded-full border border-zinc-800 flex items-center justify-center text-xs tabular-nums text-zinc-400">
                        {i + 1}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {stat.profile.avatarUrl && (
                          <img src={stat.profile.avatarUrl} alt="" className="w-8 h-8 rounded" loading="lazy" />
                        )}
                        <div>
                          <div className="font-medium text-white">{stat.profile.displayName}</div>
                          <div className="text-xs text-zinc-400 capitalize">{stat.profile.platform}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-right font-medium text-white">{stat.hours === null ? 'Unknown' : stat.hours.toFixed(1)}</td>
                    <td className="py-3 text-right text-zinc-300">{stat.games}</td>
                    <td className="py-3 text-right text-zinc-300">{stat.achievements}</td>
                    <td className="py-3 text-right text-zinc-400">{stat.uniqueGames}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Most Played */}
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-4">Most Played</h2>
            <div className="space-y-2">
              {mostPlayedOverall.map((game, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-white">{game.games[0]?.title ?? game.normalizedTitle}</span>
                  <span className="text-zinc-400">{formatHours(game.totalPlaytimeMinutes)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recently Played */}
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-4">Recently Played</h2>
            <div className="space-y-2">
              {recentlyPlayed.map((game, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-white">{game.games[0]?.title ?? game.normalizedTitle}</span>
                  <span className="text-zinc-400">{game.lastPlayedAt.toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function isExampleQuery(query: URLSearchParams): boolean {
  return query.get('example') === '1';
}
