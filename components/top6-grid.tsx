import type { NormalizedGame, Platform } from '@/lib/types';
import { formatHours } from '@/lib/utils/playtime';

interface Top6GridProps {
  games: NormalizedGame[];
  disabledAccounts: Set<string>;
  playerName: string;
  avatarUrl?: string;
}

const platformNames: Record<Platform, string> = { xbox: 'Xbox', steam: 'Steam', psn: 'PlayStation' };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function Top6Grid({ games, disabledAccounts, playerName, avatarUrl }: Top6GridProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game) => {
          // Check if all game instances are from disabled accounts
          const allAccountsDisabled = game.games.every(g => {
            const accountId = g.accountId || '';
            const accountKey = `${g.platform}:${accountId}`;
            return disabledAccounts.has(accountKey);
          });

          // Filter to only enabled accounts
          const enabledGames = game.games.filter(g => {
            const accountId = g.accountId || '';
            const accountKey = `${g.platform}:${accountId}`;
            return !disabledAccounts.has(accountKey);
          });

          // Recalculate playtime for enabled accounts only
          const enabledPlaytime = enabledGames.reduce((sum, g) => {
            return sum + (g.playtimeMinutes || 0);
          }, 0);
          const hasPlaytime = enabledGames.some(g => g.playtimeMinutes !== undefined);

          // Recalculate achievements for enabled accounts only
          const enabledAchievements = {
            earned: enabledGames.reduce((sum, g) => sum + (g.achievementProgress?.earned || 0), 0),
            total: enabledGames.reduce((sum, g) => sum + (g.achievementProgress?.total || 0), 0),
          };
          const hasAchievements = enabledAchievements.total > 0;

          // Get latest play date from enabled accounts
          const latestPlayDate = enabledGames.reduce((latest, g) => {
            if (!g.lastPlayedAt) return latest;
            if (!latest) return g.lastPlayedAt;
            return g.lastPlayedAt > latest ? g.lastPlayedAt : latest;
          }, null as Date | null);

          // Get unique platforms from enabled accounts
          const platforms = Array.from(new Set(enabledGames.map(g => g.platform)));

          return (
            <div
              key={game.normalizedTitle}
              className={`bg-zinc-900 rounded-lg overflow-hidden border-2 transition-all ${
                allAccountsDisabled
                  ? 'border-zinc-800 opacity-50'
                  : 'border-zinc-800 hover:border-emerald-500/50'
              }`}
            >
              {game.coverUrl && (
                <div className="relative">
                  <img
                    src={game.coverUrl}
                    alt={game.games[0].title}
                    className="w-full h-64 object-cover"
                  />
                  {allAccountsDisabled && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <div className="text-center px-4">
                        <svg className="w-12 h-12 mx-auto mb-2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        <p className="text-sm text-zinc-400 font-medium">Account Hidden</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-lg mb-1 line-clamp-2">{game.games[0].title}</h3>
                  {game.note && (
                    <p className="text-xs text-zinc-400 italic">{game.note}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  {platforms.map(platform => (
                    <span key={platform} className="capitalize">{platformNames[platform]}</span>
                  )).reduce((prev, curr, i) => (
                    <>{prev}{i > 0 ? ', ' : ''}{curr}</>
                  ), <></>)}
                </div>

                {allAccountsDisabled ? (
                  <div className="text-sm text-zinc-400">All accounts hidden</div>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-zinc-400 mb-1">Playtime</div>
                      <div className="text-sm font-mono text-emerald-400">
                        {hasPlaytime ? formatHours(enabledPlaytime) : 'Playtime unknown'}
                      </div>
                    </div>

                    {hasAchievements && (
                      <div>
                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                          <span>Achievements</span>
                          <span>{enabledAchievements.earned} / {enabledAchievements.total}</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-2 rounded-full transition-all"
                            style={{
                              width: `${(enabledAchievements.earned / enabledAchievements.total) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {latestPlayDate && (
                      <div>
                        <div className="text-xs text-zinc-400 mb-1">Last Played</div>
                        <div className="text-sm text-zinc-400">{formatDate(latestPlayDate)}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
