import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { XboxAdapter, xboxEmptyHistoryMessage, XBOX_PRIVACY_PATH } from '../lib/adapters/xbox-adapter';
import { describeAccountError, XBOX_PRIVACY_STEPS } from '../lib/account-errors';
import { getCache, XBOX_EMPTY_HISTORY_CACHE_TTL_SECONDS } from '../lib/cache';
import { GET as profile } from '../app/api/profile/route';

/*
 * Real OpenXBL behavior (2026-10-01): "nF Colors" (XUID 2535430316306311, gamerscore 45)
 * has a hidden game history, and /v2/achievements/player/{xuid} answers HTTP 200 with
 * { xuid, titles: [] } instead of a 403. The site used to show that as 0 games, no error.
 */
const XUID = '2535430316306311';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const friendsSearch = (gamerscore: string) => ({
  code: 200,
  content: {
    profileUsers: [{
      id: XUID,
      settings: [
        { id: 'Gamertag', value: 'nF Colors' },
        { id: 'Gamerscore', value: gamerscore },
        { id: 'GameDisplayPicRaw', value: 'https://images-eds-ssl.xboxlive.com/image?url=abc' },
      ],
    }],
  },
});
const EMPTY_TITLES = { code: 200, content: { xuid: XUID, titles: [] } };

const realFetch = global.fetch;
let f: ReturnType<typeof vi.fn>;
beforeEach(() => {
  f = vi.fn();
  global.fetch = f as unknown as typeof fetch;
  process.env.OPENXBL_API_KEY = 'test-openxbl-key-000';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = realFetch;
  delete process.env.OPENXBL_API_KEY;
  vi.restoreAllMocks();
});

describe('xboxEmptyHistoryMessage', () => {
  it('is definite when the profile has gamerscore, hedged when it does not, and always gives the settings path', () => {
    expect(xboxEmptyHistoryMessage(45)).toBe(`This player's Xbox game history is private — ${XBOX_PRIVACY_PATH}.`);
    expect(xboxEmptyHistoryMessage(0)).toMatch(/^No Xbox games are visible/);
    expect(xboxEmptyHistoryMessage(undefined)).toContain(XBOX_PRIVACY_PATH);
    expect(XBOX_PRIVACY_PATH).toBe('Settings > Account > Privacy & online safety > Xbox privacy > View details & customize > Game & app content: Everybody');
  });
});

describe('XboxAdapter.resolvePlayer gamerscore', () => {
  it('reads Gamerscore from friends/search settings', async () => {
    f.mockResolvedValueOnce(json(friendsSearch('45')));
    const r = await new XboxAdapter('k').resolvePlayer('nF colors');
    expect(r.success && r.data).toMatchObject({ id: XUID, displayName: 'nF Colors', gamerscore: 45 });
  });
  it('reads gamerScore from the fuzzy /v2/search fallback', async () => {
    f.mockResolvedValueOnce(json({ code: 429, content: { version: 1, currentRequests: 80, maxRequests: 60, periodInSeconds: 300, limitType: 'Rate' } }))
      .mockResolvedValueOnce(json({ code: 200, content: { people: [{ xuid: XUID, gamertag: 'nF Colors', gamerScore: '45' }] } }));
    const r = await new XboxAdapter('k').resolvePlayer('nF colors');
    expect(r.success && r.data).toMatchObject({ id: XUID, gamerscore: 45 });
  });
});

describe('/api/profile with a hidden Xbox game history', () => {
  const get = (q: string, ip = '10.7.7.7') => profile(new NextRequest(`http://localhost/api/profile?${q}`, { headers: { 'x-real-ip': ip } }));

  it('returns the privacy message instead of a silent 0 games, skips the playtime call, and caches briefly', async () => {
    f.mockResolvedValueOnce(json(friendsSearch('45'))).mockResolvedValueOnce(json(EMPTY_TITLES));
    const res = await get('xbox=nF%20colors');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles[0]).toMatchObject({ id: XUID, displayName: 'nF Colors', gameCount: 0 });
    expect(body.games).toEqual([]);
    const entries = Object.entries(body.errors as Record<string, string>);
    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toMatch(/^xbox-nF colors-games$/i);
    expect(entries[0][1]).toBe(xboxEmptyHistoryMessage(45));
    // friends/search + title history only: no POST /v2/player/stats for an empty library.
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls.map(c => String(c[0]))).not.toContain('https://api.xbl.io/v2/player/stats');

    // Cached (no new upstream calls) and still explained on the repeat.
    const again = await (await get('xbox=nF%20colors', '10.7.7.8')).json();
    expect(f).toHaveBeenCalledTimes(2);
    expect(Object.values(again.errors)).toEqual([xboxEmptyHistoryMessage(45)]);
    expect(XBOX_EMPTY_HISTORY_CACHE_TTL_SECONDS).toBe(600);
  });

  it('explains an empty entry cached before this fix instead of showing 0 games', async () => {
    await getCache().set('xbox:profile:v2:nf colors', { profile: { id: XUID, displayName: 'nF Colors', platform: 'xbox' }, games: [] }, 3600);
    const body = await (await get('xbox=nF%20colors', '10.7.7.9')).json();
    expect(f).not.toHaveBeenCalled();
    expect(Object.values(body.errors)[0]).toMatch(/game history is private/);
  });

  it('the UI shows it as a private Xbox profile with the settings steps', () => {
    const e = describeAccountError('xbox-nF colors-games', xboxEmptyHistoryMessage(45));
    expect(e).toMatchObject({ kind: 'private', platform: 'xbox', title: 'This Xbox game history is private', steps: XBOX_PRIVACY_STEPS });
  });
});
