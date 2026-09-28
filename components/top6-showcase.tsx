import type { NormalizedGame } from '@/lib/types';
import { mergeAchievementProgress } from '@/lib/utils/achievements';
import { showcaseLayout, formatShowcaseHours, type ShowcaseSize } from '@/lib/export/showcase-layout';

interface Top6ShowcaseProps {
  games: NormalizedGame[];
  playerName: string;
  avatarUrl?: string;
  subtitle?: string;
  disabledAccounts: Set<string>;
  size?: ShowcaseSize;
}

export function Top6Showcase({
  games,
  playerName,
  avatarUrl,
  subtitle = 'The Games That Shaped Who I Am',
  disabledAccounts,
  size = 6,
}: Top6ShowcaseProps) {
  const layout = showcaseLayout(size);
  const compact = layout.caption === 'compact';
  const proxyImageUrl = (url: string) => {
    if (!url) return url;
    if (url.startsWith('data:')) return url;
    return `/api/image?url=${encodeURIComponent(url)}`;
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

  return (
    <div className="w-full bg-zinc-950 rounded-2xl p-8 border border-zinc-800">
      {/* Header with profile picture and title */}
      <div className="flex items-center justify-center gap-4 mb-8">
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt={playerName}
            className="w-16 h-16 rounded-full border-4 border-zinc-800"
          />
        )}
        <div className="text-center">
          <div className="mb-2">
            <h2 className="text-2xl font-semibold tracking-tight text-white">My Top {size}</h2>
          </div>
          <p className="text-sm text-zinc-400 italic">{subtitle}</p>
          <p className="text-xs text-zinc-400 mt-1">{playerName}</p>
        </div>
      </div>

      {/* Responsive grid: 3x2 / 5x2 / 5x5 / 10x5 on wide screens */}
      <div className={`grid ${layout.pageGridClass} ${compact ? 'gap-2' : 'gap-4'}`}>
        {games.slice(0, size).map((game) => {
          const enabledGames = game.games.filter(g => {
            const accountId = g.accountId ?? '';
            return !disabledAccounts.has(`${g.platform}:${accountId}`);
          });

          const allAccountsDisabled = enabledGames.length === 0;
          const enabledPlaytime = enabledGames.reduce((sum, g) => 
            sum + (g.playtimeMinutes ?? 0), 0
          );
          const hasPlaytime = enabledGames.some(g => g.playtimeMinutes !== undefined);
          
          // Only accounts with real achievement data count; otherwise unknown (no fake 0/N).
              const enabledAchievements = mergeAchievementProgress(enabledGames) ?? { earned: 0, total: 0 };

          const latestPlayDate = enabledGames.reduce<Date | null>((latest, g) => {
            if (!g.lastPlayedAt) return latest;
            const gameDate = new Date(g.lastPlayedAt);
            if (!latest || gameDate > latest) return gameDate;
            return latest;
          }, null);

          return (
            <div
              key={game.normalizedTitle}
              className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 flex flex-col"
            >
              {/* Portrait cover art */}
              <div className="aspect-[2/3] relative bg-zinc-950">
                {game.coverUrl ? (
                  <img
                    src={proxyImageUrl(game.coverUrl)}
                    alt={game.games[0].title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center px-2 text-center text-xs text-zinc-400">
                    {game.games[0].title}
                  </div>
                )}
                {allAccountsDisabled && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-xs text-zinc-400">Hidden</span>
                  </div>
                )}
              </div>

              {/* Caption bar */}
              <div className={`bg-zinc-900/95 ${compact ? 'p-1.5' : 'p-3'}`}>
                <h3 className="font-bold text-xs text-white truncate mb-1">
                  {game.games[0].title}
                </h3>
                {!allAccountsDisabled && (
                  <div className="text-[10px] text-zinc-400 space-y-0.5">
                    <div>
                      {hasPlaytime ? formatShowcaseHours(enabledPlaytime) : 'Playtime unknown'}
                    </div>
                    {!compact && enabledAchievements.total > 0 && (
                      <div>
                        {enabledAchievements.earned}/{enabledAchievements.total} achievements
                      </div>
                    )}
                    {!compact && latestPlayDate && (
                      <div>{formatDate(latestPlayDate)}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer brand pill */}
      <div className="mt-6 flex justify-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5">
          <span className="text-xs font-medium text-zinc-400">GAMER.ID</span>
        </div>
      </div>
    </div>
  );
}
