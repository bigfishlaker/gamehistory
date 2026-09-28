import type { PlayerProfile } from '@/lib/types';
import { formatHours } from '@/lib/utils/playtime';

interface ProfileCardProps {
  profile: PlayerProfile;
}

const platformColors = {
  xbox: 'border-zinc-800',
  steam: 'border-zinc-800',
  psn: 'border-zinc-800',
};

const platformLabels = {
  xbox: 'Xbox',
  steam: 'Steam',
  psn: 'PlayStation',
};

export function ProfileCard({ profile }: ProfileCardProps) {
  return (
    <div className={`${platformColors[profile.platform]} border rounded-lg p-5 bg-zinc-900/40`}>
      <div className="flex items-center space-x-4">
        {profile.avatarUrl && (
          <img
            src={profile.avatarUrl}
            alt={profile.displayName}
            className="w-16 h-16 rounded-full border border-zinc-700"
          />
        )}
        <div className="flex-1">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">{platformLabels[profile.platform]}</div>
          <div className="text-xl font-semibold text-white">{profile.displayName}</div>
          {(profile.gameCount !== undefined || profile.totalPlaytimeMinutes !== undefined) && (
            <div className="mt-2 flex gap-4 text-sm text-zinc-300">
              {profile.gameCount !== undefined && (
                <span>{profile.gameCount} games</span>
              )}
              {profile.totalPlaytimeMinutes !== undefined ? (
                <span>{formatHours(profile.totalPlaytimeMinutes)}</span>
              ) : profile.gameCount !== undefined && profile.gameCount > 0 ? (
                <span className="text-zinc-400">playtime unknown</span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
