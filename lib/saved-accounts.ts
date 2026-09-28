/**
 * Browser-only persistence for the visitor's looked-up accounts.
 *
 * - "current": the account set the visitor is working with (restored on / and /dashboard).
 * - "recent": the last 5 distinct account sets, newest first.
 * - "pending": accounts added in the home SearchForm but not submitted yet (sessionStorage).
 *
 * Nothing here is sent to the server. The example (?example=1) never calls saveAccountSet.
 */
import { useMemo, useSyncExternalStore } from 'react';

export type SavedPlatform = 'xbox' | 'steam' | 'psn' | 'epic';

export interface SavedAccount {
  platform: SavedPlatform;
  identifier: string;
  displayName?: string;
}

export interface AccountSet {
  accounts: SavedAccount[];
  /** Disabled account keys, same format as the /p `off=` param (platform:profileId). */
  off: string[];
  savedAt: number;
}

export const CURRENT_KEY = 'gamerid:accounts:current:v1';
export const RECENT_KEY = 'gamerid:accounts:recent:v1';
export const PENDING_KEY = 'gamerid:accounts:pending:v1';
export const MAX_RECENT = 5;
export const ACCOUNT_PLATFORMS = ['xbox', 'steam', 'psn', 'epic'] as const;
const MAX_ACCOUNTS = 10;
const CHANGE_EVENT = 'gamerid:accounts-changed';
const PLATFORMS: readonly SavedPlatform[] = ['xbox', 'steam', 'psn', 'epic'];

function isPlatform(value: unknown): value is SavedPlatform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

function sanitizeAccounts(value: unknown): SavedAccount[] {
  if (!Array.isArray(value)) return [];
  const out: SavedAccount[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { platform, identifier, displayName } = item as Record<string, unknown>;
    if (!isPlatform(platform) || typeof identifier !== 'string' || !identifier.trim()) continue;
    out.push({
      platform,
      identifier: identifier.trim().slice(0, 200),
      ...(typeof displayName === 'string' && displayName.trim() ? { displayName: displayName.trim().slice(0, 100) } : {}),
    });
    if (out.length >= MAX_ACCOUNTS) break;
  }
  return out;
}

function sanitizeSet(value: unknown): AccountSet | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const accounts = sanitizeAccounts(raw.accounts);
  if (accounts.length === 0) return null;
  const off = Array.isArray(raw.off) ? raw.off.filter((k): k is string => typeof k === 'string').slice(0, MAX_ACCOUNTS) : [];
  const savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : 0;
  return { accounts, off, savedAt };
}

export function parseAccountSet(raw: string | null): AccountSet | null {
  if (!raw) return null;
  try {
    return sanitizeSet(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseRecentSets(raw: string | null): AccountSet[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeSet).filter((s): s is AccountSet => s !== null).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function parsePendingAccounts(raw: string | null): SavedAccount[] {
  if (!raw) return [];
  try {
    return sanitizeAccounts(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Identity of a set: which accounts, ignoring order, case and display names. */
export function accountSetKey(accounts: SavedAccount[]): string {
  return accounts
    .map(a => `${a.platform}:${a.identifier.toLowerCase()}`)
    .sort()
    .join('|');
}

/** Query string (no leading "?") with xbox/steam/psn/epic params plus off= when set. */
export function accountSetQuery(set: Pick<AccountSet, 'accounts' | 'off'>): string {
  const params = new URLSearchParams();
  for (const platform of PLATFORMS) {
    for (const a of set.accounts) if (a.platform === platform) params.append(platform, a.identifier);
  }
  if (set.off.length > 0) params.set('off', set.off.join(','));
  return params.toString();
}

export function accountSetLabel(set: Pick<AccountSet, 'accounts'>): string {
  return set.accounts.map(a => a.displayName || a.identifier).join(', ');
}

function storage(kind: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readRaw(kind: 'local' | 'session', key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(kind: 'local' | 'session', key: string, value: string | null) {
  const s = storage(kind);
  if (!s) return;
  try {
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Storage full or blocked (private mode): persistence is best-effort.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getCurrentAccountSet(): AccountSet | null {
  return parseAccountSet(readRaw('local', CURRENT_KEY));
}

export function getRecentAccountSets(): AccountSet[] {
  return parseRecentSets(readRaw('local', RECENT_KEY));
}

/** Save the visitor's current accounts and push them to the recent list. No-op if unchanged. */
export function saveAccountSet(accounts: SavedAccount[], off: string[] = []): void {
  const clean = sanitizeAccounts(accounts);
  if (clean.length === 0 || !storage('local')) return;
  const next: AccountSet = { accounts: clean, off: [...off].sort(), savedAt: Date.now() };
  const key = accountSetKey(clean);

  const current = getCurrentAccountSet();
  const unchanged =
    current !== null &&
    accountSetKey(current.accounts) === key &&
    current.off.join(',') === next.off.join(',') &&
    accountSetLabel(current) === accountSetLabel(next);
  if (unchanged) return;

  const recent = getRecentAccountSets().filter(s => accountSetKey(s.accounts) !== key);
  writeRaw('local', CURRENT_KEY, JSON.stringify(next));
  writeRaw('local', RECENT_KEY, JSON.stringify([next, ...recent].slice(0, MAX_RECENT)));
}

/** "Forget these accounts": drop the current set and its recent entry. */
export function forgetCurrentAccountSet(): void {
  const current = getCurrentAccountSet();
  writeRaw('local', CURRENT_KEY, null);
  if (current) removeRecentAccountSet(accountSetKey(current.accounts));
}

export function removeRecentAccountSet(key: string): void {
  const recent = getRecentAccountSets().filter(s => accountSetKey(s.accounts) !== key);
  writeRaw('local', RECENT_KEY, recent.length ? JSON.stringify(recent) : null);
}

export function clearRecentAccountSets(): void {
  writeRaw('local', RECENT_KEY, null);
}

export function getPendingAccounts(): SavedAccount[] {
  return parsePendingAccounts(readRaw('session', PENDING_KEY));
}

export function setPendingAccounts(accounts: SavedAccount[]): void {
  writeRaw('session', PENDING_KEY, accounts.length ? JSON.stringify(accounts) : null);
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

const serverSnapshot = () => null;

/** Reactive view of the saved sets. Returns empty values during SSR / first hydration render. */
export function useSavedAccounts(): { current: AccountSet | null; recent: AccountSet[] } {
  const currentRaw = useSyncExternalStore(subscribe, () => readRaw('local', CURRENT_KEY), serverSnapshot);
  const recentRaw = useSyncExternalStore(subscribe, () => readRaw('local', RECENT_KEY), serverSnapshot);
  const current = useMemo(() => parseAccountSet(currentRaw), [currentRaw]);
  const recent = useMemo(() => parseRecentSets(recentRaw), [recentRaw]);
  return { current, recent };
}

/** Reactive view of the SearchForm's not-yet-submitted accounts (sessionStorage). */
export function usePendingAccounts(): SavedAccount[] {
  const raw = useSyncExternalStore(subscribe, () => readRaw('session', PENDING_KEY), serverSnapshot);
  return useMemo(() => parsePendingAccounts(raw), [raw]);
}

/**
 * Pair looked-up identifiers with the display names the API returned, so saved sets
 * read "Gabe, Stallion83" instead of raw IDs. Unmatched accounts keep just the identifier.
 */
export function withDisplayNames(
  entries: Array<{ platform: SavedPlatform; identifier: string }>,
  profiles: Array<{ platform: string; id: string; displayName?: string }>,
): SavedAccount[] {
  return entries.map(({ platform, identifier }) => {
    const id = identifier.toLowerCase();
    const match = profiles.find(
      p => p.platform === platform && (p.id.toLowerCase() === id || (p.displayName ?? '').toLowerCase() === id),
    );
    return match?.displayName ? { platform, identifier, displayName: match.displayName } : { platform, identifier };
  });
}

/** Read xbox/steam/psn/epic entries (in platform order) from a query string. */
export function accountsFromParams(params: URLSearchParams): Array<{ platform: SavedPlatform; identifier: string }> {
  const out: Array<{ platform: SavedPlatform; identifier: string }> = [];
  for (const platform of PLATFORMS) {
    for (const id of params.getAll(platform)) if (id.trim()) out.push({ platform, identifier: id.trim() });
  }
  return out;
}
