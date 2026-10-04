import { keccak256, toBytes, type Hex } from 'viem';
import type { Platform } from '@/lib/types';

/**
 * The Top 6 is locked forever at mint: its canonical JSON is passed to mint(), hashed
 * on-chain and emitted in CardMinted. The server builds it from the player's real
 * library (never from client-supplied text) so nothing arbitrary ends up on-chain.
 */
export const TOP6_SIZE = 6;
export const TOP6_VERSION = 1;
export const MAX_TITLE_LENGTH = 80;
export const MAX_TOP6_JSON_BYTES = 4096;

export interface Top6Entry {
  /** Display title of the merged game. */
  t: string;
  /** Platforms the game was played on, sorted. */
  p: Platform[];
  /** Hours played when the card was minted (rounded down). */
  h: number;
  /** Cover art URL (platform CDNs only) or omitted. */
  c?: string;
}

export interface Top6Doc {
  v: typeof TOP6_VERSION;
  top6: Top6Entry[];
}

const PLATFORM_ORDER: Platform[] = ['xbox', 'steam', 'psn', 'epic'];

/** Same host list as the /api/image proxy: covers come only from platform CDNs. */
export const COVER_HOSTS = [
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'media.steampowered.com',
  'images-eds-ssl.xboxlive.com',
  'store-images.s-microsoft.com',
  'image.api.playstation.com',
  'psnobj.prod.dl.playstation.net',
];

export function sanitizeTitle(title: string): string {
  // Strip control / bidi-override characters and collapse whitespace.
  const cleaned = title
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, MAX_TITLE_LENGTH).join('');
}

export function sanitizeCover(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.startsWith('//') ? `https:${url}` : url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    if (!COVER_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) return undefined;
    u.protocol = 'https:';
    const s = u.toString();
    return s.length <= 500 ? s : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeEntry(e: { title: string; platforms: Platform[]; minutes: number; cover?: string }): Top6Entry {
  const p = PLATFORM_ORDER.filter(x => e.platforms.includes(x));
  const entry: Top6Entry = { t: sanitizeTitle(e.title), p, h: Math.max(0, Math.floor((e.minutes || 0) / 60)) };
  const c = sanitizeCover(e.cover);
  if (c) entry.c = c;
  return entry;
}

/** Deterministic serialization (fixed key order, no whitespace). */
export function canonicalTop6Json(entries: Top6Entry[]): string {
  if (entries.length < 1 || entries.length > TOP6_SIZE) throw new Error(`Top 6 must have 1-${TOP6_SIZE} games`);
  const titles = new Set<string>();
  const ordered = entries.map(e => {
    const t = sanitizeTitle(e.t);
    if (!t) throw new Error('Empty title');
    const key = t.toLowerCase();
    if (titles.has(key)) throw new Error(`Duplicate game: ${t}`);
    titles.add(key);
    const out: Top6Entry = { t, p: PLATFORM_ORDER.filter(x => e.p.includes(x)), h: Math.max(0, Math.floor(e.h)) };
    const c = sanitizeCover(e.c);
    if (c) out.c = c;
    return out;
  });
  const json = JSON.stringify({ v: TOP6_VERSION, top6: ordered } satisfies Top6Doc);
  if (new TextEncoder().encode(json).length > MAX_TOP6_JSON_BYTES) throw new Error('Top 6 too large');
  return json;
}

export function top6Hash(json: string): Hex {
  return keccak256(toBytes(json));
}

export function parseTop6Json(json: string): Top6Doc | null {
  try {
    const doc = JSON.parse(json) as Top6Doc;
    if (doc?.v !== TOP6_VERSION || !Array.isArray(doc.top6)) return null;
    return doc;
  } catch {
    return null;
  }
}
