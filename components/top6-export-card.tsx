import type { CSSProperties } from 'react';
import type { NormalizedGame } from '@/lib/types';
import { mergeAchievementProgress } from '@/lib/utils/achievements';
import { showcaseLayout, formatShowcaseHours, type ShowcaseSize } from '@/lib/export/showcase-layout';

interface Top6ExportCardProps {
  games: NormalizedGame[];
  playerName: string;
  avatarUrl?: string;
  subtitle?: string;
  disabledAccounts: Set<string>;
  /** 6, 10, 25 or 50 games. */
  size?: ShowcaseSize;
  /** Pooled total playtime (enabled accounts) for the header line. */
  totalMinutes?: number;
  accountCount?: number;
}

export const EXPORT_WATERMARK = 'gamer-id.vercel.app';

// Neutral dark palette (matches the site): near-black board, 1px zinc borders,
// white titles and one accent (emerald) for hours.
const C = {
  bg: '#09090b',
  tile: '#18181b',
  border: '#27272a',
  text: '#fafafa',
  muted: '#a1a1aa',
  faint: '#71717a',
  accent: '#34d399',
  cover: '#0f0f11',
};

const proxyImageUrl = (url: string) => (!url || url.startsWith('data:') ? url : `/api/image?url=${encodeURIComponent(url)}`);

function formatDate(date: Date): string {
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function clamp(lines: number, fontPx: number, lineHeight = 1.15): CSSProperties {
  if (lines <= 1) {
    return { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight };
  }
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight,
    maxHeight: `${Math.ceil(fontPx * lineHeight * lines)}px`,
    wordBreak: 'break-word',
  };
}

interface TileData {
  key: string;
  title: string;
  coverUrl?: string;
  hidden: boolean;
  hasPlaytime: boolean;
  minutes: number;
  achievements: { earned: number; total: number };
  latest: Date | null;
}

function tileData(game: NormalizedGame, disabledAccounts: Set<string>): TileData {
  const enabledGames = game.games.filter(g => !disabledAccounts.has(`${g.platform}:${g.accountId ?? ''}`));
  const latest = enabledGames.reduce<Date | null>((l, g) => {
    if (!g.lastPlayedAt) return l;
    const d = new Date(g.lastPlayedAt);
    return !l || d > l ? d : l;
  }, null);
  return {
    key: game.normalizedTitle,
    title: game.games[0].title,
    coverUrl: game.coverUrl,
    hidden: enabledGames.length === 0,
    hasPlaytime: enabledGames.some(g => g.playtimeMinutes !== undefined && g.playtimeMinutes !== null),
    minutes: enabledGames.reduce((sum, g) => sum + (g.playtimeMinutes ?? 0), 0),
    // Only accounts with real achievement data count; otherwise unknown (no fake 0/N).
    achievements: mergeAchievementProgress(enabledGames) ?? { earned: 0, total: 0 },
    latest,
  };
}

function Cover({ t, style }: { t: TileData; style: CSSProperties }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: C.cover, flexShrink: 0, ...style }}>
      {t.coverUrl ? (
        <img
          src={proxyImageUrl(t.coverUrl)}
          alt={t.title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          crossOrigin="anonymous"
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', textAlign: 'center', color: C.faint, fontSize: '14px', fontWeight: 600 }}>
          {t.title.slice(0, 24)}
        </div>
      )}
      {t.hidden && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      )}
    </div>
  );
}

function hoursLabel(t: TileData): string {
  if (t.hidden) return 'Hidden';
  return t.hasPlaytime ? formatShowcaseHours(t.minutes) : 'Unknown';
}

/**
 * The shareable Top 6/10/25/50 image. A fixed 1080x1350 (4:5) card, exported at 2x,
 * built to stay readable when X shows it ~600px wide on a phone:
 *  - Top 6: big cover cards with title + hours.
 *  - Top 10: big horizontal cards (thumbnail, rank, title, hours).
 *  - Top 25/50: text-first ranked list with small thumbnails and ellipsized titles.
 */
export function Top6ExportCard({
  games,
  playerName,
  avatarUrl,
  subtitle = 'The Games That Shaped Who I Am',
  disabledAccounts,
  size = 6,
  totalMinutes,
  accountCount,
}: Top6ExportCardProps) {
  const L = showcaseLayout(size);
  const tiles = games.slice(0, size).map(g => tileData(g, disabledAccounts));
  const anyUnknown = tiles.some(t => !t.hidden && !t.hasPlaytime);
  const pad = 48;
  const listFlow = L.style === 'list';

  return (
    <div
      data-export-card={size}
      style={{
        width: `${L.cardWidth}px`,
        height: `${L.cardHeight}px`,
        background: C.bg,
        color: C.text,
        padding: `${pad}px`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Header: avatar, name, pooled hours (the hero number), title + subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', marginBottom: '28px' }}>
        {avatarUrl && (
          <img
            // Proxied like the covers (the avatar hosts send no CORS headers).
            src={proxyImageUrl(avatarUrl)}
            alt={playerName}
            style={{ width: `${L.avatarPx}px`, height: `${L.avatarPx}px`, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${C.border}` }}
            crossOrigin="anonymous"
          />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>My Top {size}</div>
          <div style={{ fontSize: '54px', fontWeight: 800, letterSpacing: '-0.02em', ...clamp(1, 54, 1.1) }}>{playerName}</div>
          {totalMinutes !== undefined && totalMinutes > 0 && (
            <div style={{ fontSize: '40px', fontWeight: 800, color: C.accent, marginTop: '4px', lineHeight: 1.1 }}>
              {formatShowcaseHours(totalMinutes)} played
              {accountCount && accountCount > 1 ? (
                <span style={{ color: C.muted, fontWeight: 600, fontSize: '28px' }}>{` across ${accountCount} accounts`}</span>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {subtitle && (
        <div style={{ fontSize: '26px', color: C.muted, fontStyle: 'italic', marginBottom: '24px', ...clamp(1, 26) }}>{subtitle}</div>
      )}

      {/* Games */}
      <div
        data-export-grid={size}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${L.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${L.rows}, minmax(0, 1fr))`,
          gridAutoFlow: listFlow ? 'column' : 'row',
          columnGap: listFlow ? '28px' : `${L.gap}px`,
          rowGap: `${L.gap}px`,
        }}
      >
        {tiles.map((t, i) => {
          if (L.style === 'cards') {
            return (
              <div key={t.key} data-export-tile style={{ background: C.tile, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Cover t={t} style={{ flex: 1, minHeight: 0 }} />
                <div style={{ padding: '14px 16px 16px' }}>
                  <div style={{ fontSize: `${L.titleFontPx}px`, fontWeight: 700, ...clamp(L.titleLines, L.titleFontPx) }}>{t.title}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: t.hasPlaytime && !t.hidden ? `${L.hoursFontPx}px` : `${L.statFontPx}px`, fontWeight: 800, color: t.hasPlaytime && !t.hidden ? C.accent : C.muted, lineHeight: 1.1 }}>
                      {t.hidden ? 'Hidden' : t.hasPlaytime ? formatShowcaseHours(t.minutes) : 'Playtime unknown'}
                    </span>
                    {t.latest && !t.hidden && (
                      <span style={{ fontSize: `${L.statFontPx}px`, color: C.faint, whiteSpace: 'nowrap' }}>{formatDate(t.latest)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          if (L.style === 'rows') {
            return (
              <div key={t.key} data-export-tile style={{ background: C.tile, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden', display: 'flex', alignItems: 'stretch', minHeight: 0 }}>
                <Cover t={t} style={{ width: `${L.thumbWidth}px` }} />
                <div style={{ flex: 1, minWidth: 0, padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: `${L.titleFontPx}px`, fontWeight: 700, color: C.faint, lineHeight: 1.15, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: `${L.titleFontPx}px`, fontWeight: 700, minWidth: 0, ...clamp(L.titleLines, L.titleFontPx) }}>{t.title}</span>
                  </div>
                  <div style={{ fontSize: t.hasPlaytime && !t.hidden ? `${L.hoursFontPx}px` : `${L.statFontPx}px`, fontWeight: 800, color: t.hasPlaytime && !t.hidden ? C.accent : C.muted, lineHeight: 1.1 }}>
                    {t.hidden ? 'Hidden' : t.hasPlaytime ? formatShowcaseHours(t.minutes) : 'Playtime unknown'}
                  </div>
                </div>
              </div>
            );
          }

          // 'list': rank, small thumbnail, ellipsized title, hours right-aligned.
          return (
            <div key={t.key} data-export-tile style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: 0, borderBottom: `1px solid ${C.border}`, paddingBottom: size === 50 ? '2px' : '6px' }}>
              <span style={{ width: size === 50 ? '34px' : '38px', flexShrink: 0, textAlign: 'right', fontSize: `${L.statFontPx}px`, fontWeight: 700, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <Cover t={t} style={{ width: `${L.thumbWidth}px`, height: `${Math.round(L.thumbWidth * 4 / 3)}px`, borderRadius: '4px' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: `${L.titleFontPx}px`, fontWeight: 600, ...clamp(L.titleLines, L.titleFontPx, 1.12) }}>{t.title}</span>
              <span style={{ flexShrink: 0, fontSize: `${L.hoursFontPx}px`, fontWeight: 800, color: t.hasPlaytime && !t.hidden ? C.accent : C.muted, fontVariantNumeric: 'tabular-nums' }}>{hoursLabel(t)}</span>
            </div>
          );
        })}
      </div>

      {/* Footer: note + watermark */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '22px', gap: '16px' }}>
        <span style={{ fontSize: '20px', color: C.faint }}>{anyUnknown ? 'Some older games don\u2019t report playtime.' : ''}</span>
        <span style={{ fontSize: '24px', fontWeight: 700, color: C.muted }}>{EXPORT_WATERMARK}</span>
      </div>
    </div>
  );
}
