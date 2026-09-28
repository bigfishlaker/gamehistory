import { describe, it, expect } from 'vitest';
import { SHOWCASE_SIZES, showcaseLayout, fillSelection, isShowcaseSize } from '../lib/export/showcase-layout';
import { computeExportPixelRatio, toProxiedUrl, MAX_EXPORT_PIXELS, MAX_EXPORT_DIMENSION } from '../lib/export/export-image';

describe('showcase layouts', () => {
  it('uses big cards for Top 6/10 and a text-first list for Top 25/50', () => {
    expect(SHOWCASE_SIZES.map(n => showcaseLayout(n).style)).toEqual(['cards', 'rows', 'list', 'list']);
    expect(SHOWCASE_SIZES.map(n => { const l = showcaseLayout(n); return `${l.cols}x${l.rows}`; })).toEqual(['3x2', '2x5', '2x13', '2x25']);
    for (const n of SHOWCASE_SIZES) expect(showcaseLayout(n).cols * showcaseLayout(n).rows).toBeGreaterThanOrEqual(n);
  });

  it('exports a 4:5 portrait card that X shows uncropped, legible at ~600px wide', () => {
    for (const n of SHOWCASE_SIZES) {
      const l = showcaseLayout(n);
      expect(l.cardWidth / l.cardHeight).toBeCloseTo(4 / 5);
      // Smallest text must stay >= ~12px when the card is shown 600px wide.
      const scale = 600 / l.cardWidth;
      expect(Math.min(l.titleFontPx, l.hoursFontPx, l.statFontPx) * scale).toBeGreaterThanOrEqual(12);
      expect(l.cardWidth * l.pixelRatio * l.cardHeight * l.pixelRatio).toBeLessThanOrEqual(MAX_EXPORT_PIXELS);
    }
  });

  it('only accepts supported sizes', () => {
    expect(isShowcaseSize(25)).toBe(true);
    expect(isShowcaseSize(7)).toBe(false);
    expect(isShowcaseSize('6')).toBe(false);
  });

  it('keeps picks in order and fills the rest from the ranking without duplicates', () => {
    const ranked = ['a', 'b', 'c', 'd', 'e'];
    expect(fillSelection(['d', 'a'], ranked, 4, x => x)).toEqual(['d', 'a', 'b', 'c']);
    expect(fillSelection(['a', 'b', 'c'], ranked, 2, x => x)).toEqual(['a', 'b']);
    expect(fillSelection([], ranked, 10, x => x)).toEqual(ranked);
  });
});

describe('export pixel budget', () => {
  it('keeps the preferred ratio for a normal Top 6 card', () => {
    expect(computeExportPixelRatio(1200, 1750, 2)).toBe(2);
  });

  it('scales down huge cards to stay under the pixel and dimension limits', () => {
    for (const [w, h, pref] of [[2000, 2100, 2], [1600, 3000, 2], [1200, 6000, 2], [900, 12000, 2]] as const) {
      const r = computeExportPixelRatio(w, h, pref);
      expect(w * r * h * r).toBeLessThanOrEqual(MAX_EXPORT_PIXELS);
      expect(Math.max(w, h) * r).toBeLessThanOrEqual(MAX_EXPORT_DIMENSION);
      expect(r).toBeGreaterThan(0);
    }
  });
});

describe('toProxiedUrl', () => {
  const origin = 'http://localhost:3000';
  it('routes remote images through the proxy and leaves local/data URLs alone', () => {
    expect(toProxiedUrl('https://avatars.steamstatic.com/a.jpg', origin)).toBe('/api/image?url=' + encodeURIComponent('https://avatars.steamstatic.com/a.jpg'));
    expect(toProxiedUrl('/api/image?url=x', origin)).toBe('/api/image?url=x');
    expect(toProxiedUrl('data:image/png;base64,AA', origin)).toBe('data:image/png;base64,AA');
  });
});

import { encodeWithinBudget } from '../lib/export/export-image';
import { formatShowcaseHours } from '../lib/export/showcase-layout';

describe('encodeWithinBudget', () => {
  const fakeCanvas = (sizes: Record<string, number>) => ({
    width: 2400, height: 3500,
    toBlob(cb: (b: Blob) => void, type: string, q?: number) {
      const n = sizes[`${type}${q ?? ''}`] ?? 1000;
      cb(new Blob([new Uint8Array(n)], { type }));
    },
  }) as unknown as HTMLCanvasElement;

  it('keeps lossless PNG when it fits', async () => {
    const r = await encodeWithinBudget(fakeCanvas({ 'image/png': 4_000_000 }));
    expect(r.type).toBe('image/png');
  });

  it('falls back to full-resolution JPEG when the PNG is over 5 MB', async () => {
    const r = await encodeWithinBudget(fakeCanvas({ 'image/png': 7_100_000, 'image/jpeg0.92': 1_800_000 }));
    expect(r.type).toBe('image/jpeg');
    expect(r.blob.size).toBe(1_800_000);
    expect(r.canvas.width).toBe(2400);
  });
});

describe('formatShowcaseHours', () => {
  it('prints full hours with separators, never "2.5k h"', () => {
    expect(formatShowcaseHours(153_000)).toBe('2,550h');
    expect(formatShowcaseHours(45)).toBe('45m');
    expect(formatShowcaseHours(367_834)).toBe('6,131h');
  });
});
