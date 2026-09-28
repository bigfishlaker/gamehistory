import type { FortniteStats, FortniteModeStats } from '@/lib/fortnite';
import { FORTNITE_MODES, fortniteHours } from '@/lib/fortnite';

const MODE_LABELS = { solo: 'Solo', duo: 'Duo', squad: 'Squad' } as const;

const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-zinc-100">{value}</div>
    </div>
  );
}

function modeRow(mode: keyof typeof MODE_LABELS, s: FortniteModeStats) {
  return (
    <tr key={mode} className="border-t border-zinc-800">
      <th scope="row" className="py-1.5 pr-3 text-left font-medium text-zinc-300">{MODE_LABELS[mode]}</th>
      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(s.matches)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(s.wins)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(s.winRate, 1)}%</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(s.kills)}</td>
      <td className="py-1.5 text-right tabular-nums">{fmt(s.kd, 2)}</td>
    </tr>
  );
}

/** Fortnite Battle Royale stats for one Epic account (fortnite-api.com, unofficial). */
export function FortniteCard({ stats }: { stats: FortniteStats }) {
  const o = stats.overall;
  const updated = stats.lastModified ? new Date(stats.lastModified) : null;
  return (
    <section aria-label={`Fortnite stats for ${stats.name}`} className="card p-5" data-testid="fortnite-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Fortnite <span className="text-sm font-normal text-zinc-400">Battle Royale · {stats.name}</span>
        </h2>
        {updated && !Number.isNaN(updated.getTime()) && (
          <span className="text-xs text-zinc-400">
            Stats updated {updated.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
        <Stat label="Hours played" value={`${fmt(fortniteHours(o.minutesPlayed), 1)}h`} />
        <Stat label="Matches" value={fmt(o.matches)} />
        <Stat label="Wins" value={fmt(o.wins)} />
        <Stat label="Win %" value={`${fmt(o.winRate, 1)}%`} />
        <Stat label="Kills" value={fmt(o.kills)} />
        <Stat label="K/D" value={fmt(o.kd, 2)} />
      </div>
      {FORTNITE_MODES.some(m => stats.modes[m]) && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Fortnite stats by mode</caption>
            <thead>
              <tr className="text-xs text-zinc-400">
                <th scope="col" className="py-1 pr-3 text-left font-normal">Mode</th>
                <th scope="col" className="py-1 pr-3 text-right font-normal">Matches</th>
                <th scope="col" className="py-1 pr-3 text-right font-normal">Wins</th>
                <th scope="col" className="py-1 pr-3 text-right font-normal">Win %</th>
                <th scope="col" className="py-1 pr-3 text-right font-normal">Kills</th>
                <th scope="col" className="py-1 text-right font-normal">K/D</th>
              </tr>
            </thead>
            <tbody>{FORTNITE_MODES.map(m => (stats.modes[m] ? modeRow(m, stats.modes[m]!) : null))}</tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-400">
        Lifetime Battle Royale stats from fortnite-api.com (unofficial). Hours count toward your totals once: if this pool also has Fortnite
        from Xbox or PlayStation, the larger number is used.
      </p>
    </section>
  );
}
