import type { NormalizedGame, Platform, PlayerProfile } from '@/lib/types';
import { formatHours } from '@/lib/utils/playtime';

interface Top6ExportViewProps {
  games: NormalizedGame[];
  playerName: string;
  avatarUrl?: string;
  profiles: PlayerProfile[];
  totalHours: number;
  disabledAccounts: Set<string>;
}

const platformNames: Record<Platform, string> = { xbox: 'Xbox', steam: 'Steam', psn: 'PlayStation', epic: 'Epic' };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function proxyImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (typeof window === 'undefined') return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export function Top6ExportView({ games, playerName, avatarUrl, profiles, totalHours, disabledAccounts }: Top6ExportViewProps) {
  const enabledProfiles = profiles.filter(p => {
    const accountKey = `${p.platform}:${p.id}`;
    return !disabledAccounts.has(accountKey);
  });

  const uniquePlatforms = Array.from(new Set(enabledProfiles.map(p => p.platform)));

  return (
    <div className="w-[1200px] h-[675px] bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {avatarUrl && (
            <img
              src={proxyImageUrl(avatarUrl)}
              alt={playerName}
              className="w-16 h-16 rounded-full border-2 border-emerald-500"
              crossOrigin="anonymous"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">{playerName}&apos;s Top 6</h1>
            <div className="flex items-center gap-3 mt-1">
              {uniquePlatforms.map(platform => (
                <span key={platform} className="text-sm text-zinc-400 capitalize">
                  {platformNames[platform]}
                </span>
              ))}
              <span className="text-sm text-emerald-400 font-mono">
                {formatHours(totalHours)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Games Grid */}
      <div className="grid grid-cols-3 gap-4 flex-1">
        {games.map((game) => {
          const allAccountsDisabled = game.games.every(g => {
            const accountId = g.accountId || '';
            const accountKey = `${g.platform}:${accountId}`;
            return disabledAccounts.has(accountKey);
          });

          const enabledGames = game.games.filter(g => {
            const accountId = g.accountId || '';
            const accountKey = `${g.platform}:${accountId}`;
            return !disabledAccounts.has(accountKey);
          });

          const enabledPlaytime = enabledGames.reduce((sum, g) => sum + (g.playtimeMinutes || 0), 0);
          const hasPlaytime = enabledGames.some(g => g.playtimeMinutes !== undefined);

          const enabledAchievements = {
            earned: enabledGames.reduce((sum, g) => sum + (g.achievementProgress?.earned || 0), 0),
            total: enabledGames.reduce((sum, g) => sum + (g.achievementProgress?.total || 0), 0),
          };
          const hasAchievements = enabledAchievements.total > 0;

          const latestPlayDate = enabledGames.reduce((latest, g) => {
            if (!g.lastPlayedAt) return latest;
            if (!latest) return g.lastPlayedAt;
            return g.lastPlayedAt > latest ? g.lastPlayedAt : latest;
          }, null as Date | null);

          const platforms = Array.from(new Set(enabledGames.map(g => g.platform)));

          return (
            <div
              key={game.normalizedTitle}
              className={`bg-zinc-900/90 rounded-lg overflow-hidden border border-zinc-800 flex flex-col ${
                allAccountsDisabled ? 'opacity-40' : ''
              }`}
            >
              {game.coverUrl && (
                <div className="relative">
                  <img
                    src={proxyImageUrl(game.coverUrl)}
                    alt={game.games[0].title}
                    className="w-full h-32 object-cover"
                    crossOrigin="anonymous"
                  />
                  {allAccountsDisabled && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-xs text-zinc-400">Hidden</span>
                    </div>
                  )}
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-white line-clamp-2 mb-1">
                    {game.games[0].title}
                  </h3>
                  <div className="text-xs text-zinc-500 mb-2">
                    {platforms.map(p => platformNames[p]).join(', ')}
                  </div>
                </div>

                {!allAccountsDisabled && (
                  <div className="space-y-2">
                    <div className="text-xs">
                      <span className="text-zinc-500">Playtime: </span>
                      <span className="text-emerald-400 font-mono">
                        {hasPlaytime ? formatHours(enabledPlaytime) : 'Unknown'}
                      </span>
                    </div>

                    {hasAchievements && (
                      <div>
                        <div className="flex justify-between text-xs text-zinc-500 mb-1">
                          <span>Achievements</span>
                          <span>{enabledAchievements.earned}/{enabledAchievements.total}</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1.5">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-1.5 rounded-full"
                            style={{
                              width: `${(enabledAchievements.earned / enabledAchievements.total) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {latestPlayDate && (
                      <div className="text-xs text-zinc-500">
                        {formatDate(latestPlayDate)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center space-y-1">
        <div className="text-[10px] text-zinc-500 italic">
          Some older games don&apos;t report playtime.
        </div>
        <div className="text-sm font-semibold text-zinc-400">GAMER.ID</div>
      </div>
    </div>
  );
}
