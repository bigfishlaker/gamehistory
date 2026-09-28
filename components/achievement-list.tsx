import type { Achievement } from '@/lib/types';

interface AchievementListProps {
  achievements: Achievement[];
}

export function AchievementList({ achievements }: AchievementListProps) {
  if (achievements.length === 0) {
    return (
      <div className="text-zinc-400 text-center py-8">
        No achievements available
      </div>
    );
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="space-y-3">
      {achievements.map((achievement) => (
        <div
          key={achievement.id}
          className={`flex items-start gap-4 p-4 rounded-lg border ${
            achievement.unlocked
              ? 'bg-zinc-900 border-green-500/20'
              : 'bg-zinc-900/50 border-zinc-800 opacity-60'
          }`}
        >
          {(achievement.iconUrl || achievement.iconLockedUrl) && (
            <img
              src={achievement.unlocked ? achievement.iconUrl : achievement.iconLockedUrl || achievement.iconUrl}
              alt={achievement.name}
              className="w-16 h-16 rounded-lg flex-shrink-0"
            />
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-white">
                {achievement.name}
              </h4>
              {achievement.unlocked && (
                <span className="text-emerald-500 text-base flex-shrink-0" aria-label="Unlocked">✓</span>
              )}
            </div>
            
            <p className="text-sm text-zinc-400 mt-1">
              {achievement.description}
            </p>
            
            <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
              {achievement.unlocked && achievement.unlockedAt && (
                <span>Unlocked {formatDate(new Date(achievement.unlockedAt))}</span>
              )}
              {achievement.rarity !== undefined && (
                <span>{achievement.rarity.toFixed(1)}% of players</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
