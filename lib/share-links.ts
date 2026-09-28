/**
 * Short share links: /u/<code> -> a stored public account set.
 *
 * Only public account identifiers (gamertag / SteamID / PSN Online ID), the account
 * toggles and the showcase view are stored. No IP, no personal data.
 */
import { validateAccountPoolSize, validateGamertag, validatePSNId, validateSteamId, MAX_ACCOUNTS_PER_POOL } from './validators';
import { normalizePSNInput, normalizeXboxInput } from './input-normalizer';
import { normalizeSteamInput } from './utils/steam-parser';
import { SHOWCASE_SIZES } from './export/showcase-layout';

export const SHARE_CODE_LENGTH = 8;
export const SHARE_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Links are meant to be permanent; Redis needs a TTL in this store API, so use ~5 years. */
export const SHARE_TTL_SECONDS = 5 * 365 * 24 * 3600;
export const MAX_SHARE_BODY_BYTES = 4096;

export const shareKey = (code: string) => `share:${code}`;
export const shareSetKey = (canonical: string) => `share-set:${canonical}`;

/** Random base62 code using crypto.getRandomValues with rejection sampling (no modulo bias). */
export function generateShareCode(length = SHARE_CODE_LENGTH, random: (n: number) => Uint8Array = defaultRandom): string {
  let out = '';
  while (out.length < length) {
    for (const b of random(length * 2)) {
      if (b < 248) out += SHARE_CODE_ALPHABET[b % 62]; // 248 = 62 * 4
      if (out.length === length) break;
    }
  }
  return out;
}

function defaultRandom(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export function isValidShareCode(code: unknown): code is string {
  return typeof code === 'string' && /^[0-9A-Za-z]{7,8}$/.test(code);
}

export interface ShareRecord {
  v: 1;
  xbox: string[];
  steam: string[];
  psn: string[];
  /** Disabled account keys (platform:profileId), as in the /p `off=` param. */
  off: string[];
  /** Public display name of the first account, used for the link preview title. */
  name?: string;
  size?: number;
  /** Showcase picks, as in the /p `top6=` param (platform-titleId). */
  top6?: string[];
  tab?: 'top6';
  example?: boolean;
  createdAt: number;
}

export type ShareValidation = { ok: true; record: ShareRecord } | { ok: false; error: string };

const OFF_RE = /^(xbox|steam|psn):[A-Za-z0-9_.-]{1,64}$/;
const TOP6_RE = /^(xbox|steam|psn|manual)-[A-Za-z0-9_.:-]{1,80}$/;
const NAME_RE = /^[\p{L}\p{N} _.#-]{1,32}$/u;

function strings(value: unknown, max: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== 'string')) return null;
  return (value as string[]).map(v => v.trim()).filter(Boolean);
}

function uniqFold(values: string[], fold: (v: string) => string): string[] {
  const seen = new Set<string>();
  return values.filter(v => (seen.has(fold(v)) ? false : (seen.add(fold(v)), true)));
}

/** Validate + normalize a share request with the same rules as /api/profile. */
export function validateShareInput(body: unknown, now = Date.now()): ShareValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid request body' };
  const b = body as Record<string, unknown>;

  const rawXbox = strings(b.xbox, MAX_ACCOUNTS_PER_POOL);
  const rawSteam = strings(b.steam, MAX_ACCOUNTS_PER_POOL);
  const rawPsn = strings(b.psn, MAX_ACCOUNTS_PER_POOL);
  if (!rawXbox || !rawSteam || !rawPsn) return { ok: false, error: 'Accounts must be arrays of strings' };

  const xbox: string[] = [];
  for (const input of rawXbox) {
    const r = normalizeXboxInput(input);
    const id = r.success && r.identifier ? r.identifier : input;
    const v = validateGamertag(id);
    if (!v.valid) return { ok: false, error: `Invalid Xbox gamertag: ${v.error}` };
    xbox.push(id.trim());
  }
  const steam: string[] = [];
  for (const input of rawSteam) {
    const id = normalizeSteamInput(input)?.value ?? input;
    const v = validateSteamId(id);
    if (!v.valid) return { ok: false, error: `Invalid Steam ID: ${v.error}` };
    steam.push(id.trim());
  }
  const psn: string[] = [];
  for (const input of rawPsn) {
    const r = normalizePSNInput(input);
    const id = r.success && r.identifier ? r.identifier : input;
    const v = validatePSNId(id);
    if (!v.valid) return { ok: false, error: `Invalid PSN ID: ${v.error}` };
    psn.push(id.trim());
  }

  const record: ShareRecord = {
    v: 1,
    xbox: uniqFold(xbox, v => v.toLowerCase()),
    steam: uniqFold(steam, v => v),
    psn: uniqFold(psn, v => v.toLowerCase()),
    off: [],
    createdAt: now,
  };
  const pool = validateAccountPoolSize(record.xbox.length, record.steam.length, record.psn.length);
  if (!pool.valid) return { ok: false, error: pool.error ?? 'Invalid account set' };

  const off = strings(b.off, MAX_ACCOUNTS_PER_POOL);
  if (!off || off.some(k => !OFF_RE.test(k))) return { ok: false, error: 'Invalid account toggles' };
  record.off = Array.from(new Set(off)).sort();

  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !NAME_RE.test(b.name.trim())) return { ok: false, error: 'Invalid name' };
    record.name = b.name.trim();
  }
  if (b.size !== undefined) {
    if (!(SHOWCASE_SIZES as readonly unknown[]).includes(b.size)) return { ok: false, error: 'Invalid showcase size' };
    if (b.size !== 6) record.size = b.size as number;
  }
  if (b.top6 !== undefined) {
    const top6 = strings(b.top6, 50);
    if (!top6 || top6.some(k => !TOP6_RE.test(k))) return { ok: false, error: 'Invalid showcase selection' };
    if (top6.length) record.top6 = top6;
  }
  if (b.tab !== undefined) {
    if (b.tab !== 'top6') return { ok: false, error: 'Invalid tab' };
    record.tab = 'top6';
  }
  if (b.example !== undefined) {
    if (typeof b.example !== 'boolean') return { ok: false, error: 'Invalid example flag' };
    if (b.example) record.example = true;
  }
  return { ok: true, record };
}

/** /p query string for a stored record. */
export function shareRecordQuery(r: Pick<ShareRecord, 'xbox' | 'steam' | 'psn' | 'off' | 'size' | 'top6' | 'tab' | 'example'>): string {
  const p = new URLSearchParams();
  r.xbox.forEach(v => p.append('xbox', v));
  r.steam.forEach(v => p.append('steam', v));
  r.psn.forEach(v => p.append('psn', v));
  if (r.off.length) p.set('off', r.off.join(','));
  if (r.top6?.length) p.set('top6', r.top6.join(','));
  if (r.size && r.size !== 6) p.set('size', String(r.size));
  if (r.tab) p.set('tab', r.tab);
  if (r.example) p.set('example', '1');
  return p.toString();
}

/** Same set + view => same code (so repeated shares don't mint new links). */
export function canonicalShareKey(r: ShareRecord): string {
  return shareRecordQuery({ ...r, xbox: [...r.xbox].map(v => v.toLowerCase()).sort(), steam: [...r.steam].sort(), psn: [...r.psn].map(v => v.toLowerCase()).sort() }) + (r.name ? `#${r.name}` : '');
}

export function isShareRecord(v: unknown): v is ShareRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.v === 1 && Array.isArray(r.xbox) && Array.isArray(r.steam) && Array.isArray(r.psn) && Array.isArray(r.off);
}

/** Preview name: stored display name, else the first identifier. */
export function shareDisplayName(r: ShareRecord): string {
  return r.name || r.xbox[0] || r.psn[0] || r.steam[0] || 'Someone';
}
