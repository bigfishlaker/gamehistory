/**
 * Showcase ("my9games"-style card) sizes and their grid layouts.
 * Pure data so it can be unit tested and shared by the on-page grid and the
 * PNG export card.
 */
export const SHOWCASE_SIZES = [6, 10, 25, 50] as const;
export type ShowcaseSize = (typeof SHOWCASE_SIZES)[number];

export interface ShowcaseLayout {
  size: ShowcaseSize;
  /**
   * Export tile style: 'cards' = cover on top + caption (Top 6), 'rows' = big horizontal
   * cards with a cover thumbnail (Top 10), 'list' = text-first ranked list (Top 25/50).
   */
  style: 'cards' | 'rows' | 'list';
  cols: number;
  rows: number;
  /** Export card size in CSS px: 4:5 portrait, which X shows uncropped in the timeline. */
  cardWidth: number;
  cardHeight: number;
  /** Gap between tiles in CSS px. */
  gap: number;
  /** On-page showcase: 'full' = title + playtime + achievements + last played; 'compact' = title + playtime. */
  caption: 'full' | 'compact';
  titleFontPx: number;
  /** Max title lines before an ellipsis. */
  titleLines: number;
  /** Hours are the hero stat on every tile. */
  hoursFontPx: number;
  statFontPx: number;
  /** Cover thumbnail width for 'rows'/'list' styles (CSS px; 3:4 thumbnails). */
  thumbWidth: number;
  /** Avatar size in the export header (CSS px). */
  avatarPx: number;
  /** Preferred export pixel ratio (clamped later by the pixel budget). */
  pixelRatio: number;
  /** Tailwind classes for the responsive on-page grid. */
  pageGridClass: string;
}

// Export sizes are CSS px on a 1080x1350 (4:5) card rendered at 2x = 2160x2700.
// X shows it ~600px wide on phones (scale ~0.56), so the smallest text here (22px)
// still lands at ~12px on screen; titles and hours are larger. Checked by rendering
// every size and downscaling it to 600px wide.
const EXPORT_W = 1080;
const EXPORT_H = 1350;

const LAYOUTS: Record<ShowcaseSize, ShowcaseLayout> = {
  6: { size: 6, style: 'cards', cols: 3, rows: 2, cardWidth: EXPORT_W, cardHeight: EXPORT_H, gap: 20, caption: 'full', titleFontPx: 30, titleLines: 2, hoursFontPx: 44, statFontPx: 22, thumbWidth: 0, avatarPx: 132, pixelRatio: 2, pageGridClass: 'grid-cols-2 sm:grid-cols-3' },
  10: { size: 10, style: 'rows', cols: 2, rows: 5, cardWidth: EXPORT_W, cardHeight: EXPORT_H, gap: 16, caption: 'full', titleFontPx: 30, titleLines: 2, hoursFontPx: 38, statFontPx: 22, thumbWidth: 128, avatarPx: 132, pixelRatio: 2, pageGridClass: 'grid-cols-2 sm:grid-cols-5' },
  25: { size: 25, style: 'list', cols: 2, rows: 13, cardWidth: EXPORT_W, cardHeight: EXPORT_H, gap: 8, caption: 'compact', titleFontPx: 25, titleLines: 2, hoursFontPx: 28, statFontPx: 22, thumbWidth: 46, avatarPx: 112, pixelRatio: 2, pageGridClass: 'grid-cols-3 sm:grid-cols-5' },
  50: { size: 50, style: 'list', cols: 2, rows: 25, cardWidth: EXPORT_W, cardHeight: EXPORT_H, gap: 4, caption: 'compact', titleFontPx: 23, titleLines: 1, hoursFontPx: 24, statFontPx: 22, thumbWidth: 24, avatarPx: 104, pixelRatio: 2, pageGridClass: 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-10' },
};

export function isShowcaseSize(n: unknown): n is ShowcaseSize {
  return typeof n === 'number' && (SHOWCASE_SIZES as readonly number[]).includes(n);
}

export function showcaseLayout(size: ShowcaseSize): ShowcaseLayout {
  return LAYOUTS[size];
}

/**
 * Keep the user's picks (in order), trimmed to `size`, then fill the remaining
 * slots from `ranked` (already sorted, e.g. by playtime) without duplicates.
 */
export function fillSelection<T>(selected: T[], ranked: T[], size: number, key: (t: T) => string): T[] {
  const out = selected.slice(0, size);
  const seen = new Set(out.map(key));
  for (const g of ranked) {
    if (out.length >= size) break;
    const k = key(g);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(g);
    }
  }
  return out;
}

/** "2,550h" (never "2.5k h"); minutes under an hour as "45m". */
export function formatShowcaseHours(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))}m`;
  return `${Math.round(minutes / 60).toLocaleString('en-US')}h`;
}
