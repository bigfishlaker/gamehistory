import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  parseFortniteStats, validateEpicName, normalizeEpicInput, fortniteHours,
  FORTNITE_PRIVATE_MESSAGE, FORTNITE_BUSY_MESSAGE, FORTNITE_GAME_TITLE, FORTNITE_GAME_ID,
} from '../lib/fortnite';
import { FortniteAdapter } from '../lib/adapters/fortnite-adapter';
import { reserveUpstream, UPSTREAM_HOURLY_LIMITS, ROUTE_LIMITS } from '../lib/rate-limit';
import { setStoreForTests, type KVStore } from '../lib/store';
import { GET as profile } from '../app/api/profile/route';
import { validateShareInput, shareRecordQuery, canonicalShareKey, isShareRecord } from '../lib/share-links';
import { accountsFromParams, accountSetQuery } from '../lib/saved-accounts';
import { summarizePlaytime } from '../lib/utils/playtime';
import { mergeGames } from '../lib/utils/title-merger';
import { describeAccountError } from '../lib/account-errors';
import type { Game } from '../lib/types';

/* Trimmed real response for Ninja (fortnite-api.com, 2026-09-27). */
const mode = (o: Record<string, number>) => ({ score: 1, scorePerMin: 1, scorePerMatch: 1, top3: 0, killsPerMin: 1, killsPerMatch: 1, playersOutlived: 0, ...o });
const NINJA = {
  status: 200,
  data: {
    account: { id: '4735ce9132924caf8a5b17789b40f79c', name: 'Ninja' },
    battlePass: { level: 1, progress: 0 },
    stats: {
      all: {
        overall: { ...mode({ wins: 11456, kills: 221111, deaths: 21748, kd: 10.167, matches: 33204, winRate: 34.502, minutesPlayed: 215425 }), lastModified: '2026-07-24T19:51:10Z' },
        solo: mode({ wins: 4000, kills: 90000, deaths: 9000, kd: 10, matches: 13000, winRate: 30.7, minutesPlayed: 80000 }),
        duo: mode({ wins: 3000, kills: 60000, deaths: 6000, kd: 10, matches: 9000, winRate: 33.3, minutesPlayed: 60000 }),
        squad: mode({ wins: 4456, kills: 71111, deaths: 6748, kd: 10.5, matches: 11204, winRate: 39.8, minutesPlayed: 75425 }),
        trio: null,
        ltm: mode({ wins: 0, kills: 0, deaths: 0, kd: 0, matches: 0, winRate: 0, minutesPlayed: 0 }),
      },
      keyboardMouse: null, gamepad: null, touch: null,
    },
  },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const realFetch = global.fetch;
let f: ReturnType<typeof vi.fn>;

class BrokenStore implements KVStore {
  readonly kind = 'upstash' as const;
  private fail(): never { throw new Error('down'); }
  async get<T>(): Promise<T | null> { return this.fail(); }
  async set(): Promise<void> { this.fail(); }
  async setMany(): Promise<void> { this.fail(); }
  async del(): Promise<void> { this.fail(); }
  async incr(): Promise<{ count: number; ttlSeconds: number }> { return this.fail(); }
}

beforeEach(() => {
  f = vi.fn();
  global.fetch = f as unknown as typeof fetch;
  process.env.FORTNITE_API_KEY = 'test-fortnite-key-000';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = realFetch;
  delete process.env.FORTNITE_API_KEY;
  vi.restoreAllMocks();
});

describe('parseFortniteStats', () => {
  it('maps the real response: hours, win %, K/D, solo/duo/squad (no trio), lastModified', () => {
    const s = parseFortniteStats(NINJA)!;
    expect(s.accountId).toBe('4735ce9132924caf8a5b17789b40f79c');
    expect(s.name).toBe('Ninja');
    expect(s.overall).toMatchObject({ matches: 33204, wins: 11456, kills: 221111, minutesPlayed: 215425 });
    expect(s.overall.winRate).toBe(34.5);
    expect(s.overall.kd).toBe(10.17);
    expect(fortniteHours(s.overall.minutesPlayed)).toBe(3590.4);
    expect(Object.keys(s.modes)).toEqual(['solo', 'duo', 'squad']);
    expect(s.lastModified).toBe('2026-07-24T19:51:10Z');
  });
  it('rejects unusable bodies', () => {
    expect(parseFortniteStats(null)).toBeNull();
    expect(parseFortniteStats({ status: 200, data: {} })).toBeNull();
  });
});

describe('Epic name validation', () => {
  it('accepts 3-16 chars with spaces and some symbols, rejects the rest', () => {
    for (const ok of ['Ninja', 'Ali-A', 'The Real Guy', 'x_y.z', "Tom's~!", 'Ñandú99']) expect(validateEpicName(ok).valid).toBe(true);
    for (const bad of ['ab', 'a'.repeat(17), '<script>', 'a/b/c', 'name?x=1', '']) expect(validateEpicName(bad).valid).toBe(false);
    expect(normalizeEpicInput('  The   Real Guy ')).toBe('The Real Guy');
  });
});

describe('FortniteAdapter (fortnite-api.com)', () => {
  it('sends the key in the Authorization header with accountType=epic and lifetime stats', async () => {
    f.mockResolvedValue(json(200, NINJA));
    const r = await new FortniteAdapter('k-123').getStats('Ninja');
    expect(r.success).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://fortnite-api.com/v2/stats/br/v2?name=Ninja&accountType=epic&timeWindow=lifetime');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'k-123' });
  });

  it('maps private (403), not found (404) and no matches (404) to friendly messages', async () => {
    f.mockResolvedValueOnce(json(403, { status: 403, error: "the requested account's stats are not public" }));
    const priv = await new FortniteAdapter('k').getStats('Clix');
    expect(priv.success || priv.error).toMatchObject({ code: 'PRIVATE_PROFILE', message: FORTNITE_PRIVATE_MESSAGE });

    f.mockResolvedValueOnce(json(404, { status: 404, error: 'the requested account does not exist' }));
    const nf = await new FortniteAdapter('k').getStats('zzqxnotarealname9');
    expect(nf.success || nf.error).toMatchObject({ code: 'PLAYER_NOT_FOUND', message: 'Epic account "zzqxnotarealname9" not found. Check the Epic display name.' });

    f.mockResolvedValueOnce(json(404, { status: 404, error: 'the requested profile didnt play any match yet' }));
    const nm = await new FortniteAdapter('k').getStats('Stallion83');
    expect(nm.success || nm.error).toMatchObject({ code: 'PLAYER_NOT_FOUND' });
    if (!nm.success) expect(nm.error.message).toMatch(/no matches played/);
  });

  it('treats upstream 429 as busy and hides other upstream errors', async () => {
    f.mockResolvedValueOnce(json(429, { status: 429, error: 'the maximum allowed requests are 3 per 1s.' }));
    const busy = await new FortniteAdapter('k').getStats('Ninja');
    expect(busy.success || busy.error).toMatchObject({ code: 'BUDGET_EXHAUSTED', message: FORTNITE_BUSY_MESSAGE });
    f.mockResolvedValueOnce(json(401, { status: 401, error: 'invalid api key k' }));
    const auth = await new FortniteAdapter('k').getStats('Ninja');
    if (!auth.success) expect(auth.error.message).not.toMatch(/api key/i);
  });

  it('has a global hourly budget (600) and fails closed when the store is down', async () => {
    expect(UPSTREAM_HOURLY_LIMITS.fortnite).toBe(600);
    await reserveUpstream('fortnite', 600);
    const r = await new FortniteAdapter('k').getStats('Ninja');
    expect(r.success || r.error).toMatchObject({ code: 'BUDGET_EXHAUSTED' });
    setStoreForTests(new BrokenStore());
    expect((await reserveUpstream('fortnite')).allowed).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('/api/profile with epic accounts', () => {
  const get = (q: string, ip = '10.1.1.1') => profile(new NextRequest(`http://localhost/api/profile?${q}`, { headers: { 'x-real-ip': ip } }));

  it('returns an Epic profile, a Fortnite game entry with hours, and the Fortnite card data; cached 15 min', async () => {
    f.mockResolvedValue(json(200, NINJA));
    const res = await get('epic=Ninja');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles[0]).toMatchObject({ platform: 'epic', displayName: 'Ninja', id: '4735ce9132924caf8a5b17789b40f79c', totalPlaytimeMinutes: 215425 });
    expect(body.games[0]).toMatchObject({ id: FORTNITE_GAME_ID, title: FORTNITE_GAME_TITLE, platform: 'epic', playtimeMinutes: 215425 });
    expect(body.fortnite['4735ce9132924caf8a5b17789b40f79c'].overall.wins).toBe(11456);
    expect(body.playtime.totalMinutes).toBe(215425);
    expect(JSON.stringify(body)).not.toContain('test-fortnite-key-000');
    await get('epic=ninja', '10.1.1.2');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('shows private / not found inline, and caches them', async () => {
    f.mockResolvedValue(json(403, { status: 403, error: "the requested account's stats are not public" }));
    const body = await (await get('epic=Clix')).json();
    expect(body.errors['epic-Clix']).toBe(FORTNITE_PRIVATE_MESSAGE);
    expect(describeAccountError('epic-Clix', body.errors['epic-Clix'])).toMatchObject({ kind: 'private', detail: FORTNITE_PRIVATE_MESSAGE });
    await get('epic=Clix');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('validates names and keeps the 6-account maximum across all platforms', async () => {
    expect((await get('epic=%3Cscript%3E')).status).toBe(400);
    expect((await get('epic=ab')).status).toBe(400);
    const seven = ['xbox=A1', 'xbox=A2', 'steam=abc', 'psn=p_1', 'epic=Ninja', 'epic=Tfue', 'epic=Bugha'].join('&');
    expect((await get(seven)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('applies a per-IP Fortnite limit', async () => {
    f.mockResolvedValue(json(200, NINJA));
    for (let i = 0; i < ROUTE_LIMITS.fortnite.limit; i++) await get('epic=Ninja', '10.9.9.9');
    expect((await get('epic=Ninja', '10.9.9.9')).status).toBe(429);
    // other platforms from the same IP are unaffected by the Fortnite bucket
    expect((await get('steam=' + 'a'.repeat(201), '10.9.9.9')).status).toBe(400);
  });
});

describe('persistence and share links', () => {
  it('reads and writes epic accounts in the URL / localStorage format', () => {
    const accounts = accountsFromParams(new URLSearchParams('xbox=Stallion83&epic=Ninja'));
    expect(accounts).toEqual([{ platform: 'xbox', identifier: 'Stallion83' }, { platform: 'epic', identifier: 'Ninja' }]);
    expect(accountSetQuery({ accounts, off: ['epic:4735ce9132924caf8a5b17789b40f79c'] })).toBe('xbox=Stallion83&epic=Ninja&off=epic%3A4735ce9132924caf8a5b17789b40f79c');
  });

  it('stores epic names in share links; old records without epic still work', () => {
    const v = validateShareInput({ xbox: ['Stallion83'], epic: ['  Ninja '], off: ['epic:4735ce9132924caf8a5b17789b40f79c'], top6: ['epic-fortnite-br'] });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.record.epic).toEqual(['Ninja']);
      expect(shareRecordQuery(v.record)).toContain('epic=Ninja');
      expect(canonicalShareKey(v.record)).toContain('epic=ninja');
    }
    expect(validateShareInput({ epic: ['<bad>'] }).ok).toBe(false);
    const old = { v: 1, xbox: ['A'], steam: [], psn: [], off: [], createdAt: 1 };
    expect(isShareRecord(old)).toBe(true);
    expect(shareRecordQuery(old as never)).toBe('xbox=A');
  });
});

describe('pooled totals', () => {
  const g = (platform: Game['platform'], title: string, minutes: number): Game => ({ id: title, title, platform, playtimeMinutes: minutes });

  it('counts Epic Fortnite hours in totals and the Top N', () => {
    const s = summarizePlaytime([g('epic', FORTNITE_GAME_TITLE, 600), g('steam', 'Portal 2', 120)]);
    expect(s.totalMinutes).toBe(720);
    expect(s.topCombined[0]).toMatchObject({ title: FORTNITE_GAME_TITLE, totalMinutes: 600 });
  });

  it('never double counts Fortnite from Epic plus a console: uses the larger side', () => {
    const games = [g('epic', FORTNITE_GAME_TITLE, 600), g('xbox', 'Fortnite', 300), g('psn', 'Fortnite', 100)];
    const merged = mergeGames(games);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalPlaytimeMinutes).toBe(600);
    expect(summarizePlaytime(games).totalMinutes).toBe(600);
    const bigConsole = [g('epic', FORTNITE_GAME_TITLE, 100), g('xbox', 'Fortnite', 900)];
    expect(summarizePlaytime(bigConsole).totalMinutes).toBe(900);
  });

  it('describes Fortnite errors with platform wording', () => {
    expect(describeAccountError('epic-Nobody', 'Epic account "Nobody" not found. Check the Epic display name.')).toMatchObject({ kind: 'not-found', title: 'Epic account not found' });
    expect(describeAccountError('epic-Ninja', FORTNITE_BUSY_MESSAGE)).toMatchObject({ kind: 'busy', title: 'Fortnite is busy right now, showing your other platforms' });
  });
});
