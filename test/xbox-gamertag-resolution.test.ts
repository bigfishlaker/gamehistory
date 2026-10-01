import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { XboxAdapter, pickSearchMatch, type OpenXBLSearchResult } from '../lib/adapters/xbox-adapter';
import { normalizeXboxInput } from '../lib/input-normalizer';
import { validateGamertag } from '../lib/validators';
import { describeAccountError } from '../lib/account-errors';
import { userSafeError } from '../lib/utils/safe-error';
import { GET as profile } from '../app/api/profile/route';

/* Real /v2/search results, 2026-10-01 (avatars trimmed). */
const AVATAR = 'https://images-eds-ssl.xboxlive.com/image?url=z951ykn43p4FqWbbFvR2Ec';
const NF_COLORS: OpenXBLSearchResult = { xuid: '2535430316306311', gamertag: 'nF Colors', modernGamertag: 'nF Colors', modernGamertagSuffix: '', uniqueModernGamertag: 'nF Colors', gamerScore: '45', displayPicRaw: AVATAR };
const NF_COLORS2: OpenXBLSearchResult = { xuid: '2535437204501403', gamertag: 'nF Colors2', modernGamertag: 'nF Colors2', modernGamertagSuffix: '', uniqueModernGamertag: 'nF Colors2', gamerScore: '1405', displayPicRaw: AVATAR };
const NF_COLOURS: OpenXBLSearchResult = { xuid: '2533274905149172', gamertag: 'nF Colours', modernGamertag: 'nF Colours', modernGamertagSuffix: '', uniqueModernGamertag: 'nF Colours', gamerScore: '22195', displayPicRaw: 'https://images-eds-ssl.xboxlive.com/image?url=wHwbXKif8cus8csoZ03RWw' };
/* Modern suffixed duplicates (shape as returned by /v2/search for suffixed gamertags). */
const suffixed = (xuid: string, suffix: string, gs: string): OpenXBLSearchResult =>
  ({ xuid, gamertag: `Colors${suffix}`, modernGamertag: 'Colors', modernGamertagSuffix: suffix, uniqueModernGamertag: `Colors#${suffix}`, gamerScore: gs });

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const THROTTLED = { code: 429, content: { version: 1, currentRequests: 93, maxRequests: 60, periodInSeconds: 300, limitType: 'Rate' } };
const search = (people: OpenXBLSearchResult[]) => ({ code: 200, content: { people } });

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

describe('pickSearchMatch (fuzzy /v2/search is not an exact lookup)', () => {
  it('picks the exact gamertag, not just the first result', () => {
    expect(pickSearchMatch('nF Colors', [NF_COLORS2, NF_COLORS]).match?.xuid).toBe('2535430316306311');
    expect(pickSearchMatch('nf colors2', [NF_COLORS, NF_COLORS2]).match?.xuid).toBe('2535437204501403');
    expect(pickSearchMatch('nF Colours', [NF_COLOURS]).match?.xuid).toBe('2533274905149172');
  });
  it('accepts a unique match that differs only by spaces, never a different name', () => {
    expect(pickSearchMatch('nFColors', [NF_COLORS, NF_COLORS2]).match?.xuid).toBe('2535430316306311');
    expect(pickSearchMatch('nF Color', [NF_COLORS, NF_COLORS2])).toEqual({});
  });
  it('resolves #suffix exactly and reports several suffixed accounts as ambiguous', () => {
    const people = [suffixed('2535000000000001', '1234', '10'), suffixed('2535000000000002', '5678', '9000')];
    expect(pickSearchMatch('Colors#5678', people).match?.xuid).toBe('2535000000000002');
    expect(pickSearchMatch('colors#9999', people).match).toBeUndefined();
    expect(pickSearchMatch('Colors', people)).toEqual({ ambiguous: ['Colors#1234', 'Colors#5678'] });
    expect(pickSearchMatch('Colors', [people[0]]).match?.xuid).toBe('2535000000000001');
  });
});

describe('XboxAdapter.resolvePlayer', () => {
  it('falls back to search when the profile service is throttled and uses the exact match (name, avatar, gamerscore)', async () => {
    f.mockResolvedValueOnce(json(THROTTLED)).mockResolvedValueOnce(json(search([NF_COLORS2, NF_COLORS])));
    const r = await new XboxAdapter('k').resolvePlayer('nf colors');
    expect(r.success && r.data).toMatchObject({ id: '2535430316306311', displayName: 'nF Colors', gamerscore: 45 });
    if (r.success) expect(r.data.avatarUrl).toContain('images-eds-ssl.xboxlive.com');
  });
  it('returns not found with suggestions instead of picking a different account', async () => {
    f.mockResolvedValueOnce(json(THROTTLED)).mockResolvedValueOnce(json(search([NF_COLORS, NF_COLORS2])));
    const r = await new XboxAdapter('k').resolvePlayer('nF Colorz');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.code).toBe('PLAYER_NOT_FOUND');
      expect(r.error.message).toBe('Gamertag "nF Colorz" not found. Did you mean nF Colors (45 gamerscore), nF Colors2 (1,405 gamerscore)?');
      expect(userSafeError(r.error.message)).toBe(r.error.message);
    }
  });
  it('asks for the #number when several accounts share the name', async () => {
    f.mockResolvedValueOnce(json(THROTTLED)).mockResolvedValueOnce(json(search([suffixed('2535000000000001', '1234', '10'), suffixed('2535000000000002', '5678', '9000')])));
    const r = await new XboxAdapter('k').resolvePlayer('Colors');
    expect(!r.success && r.error.code).toBe('AMBIGUOUS_GAMERTAG');
    if (!r.success) {
      expect(r.error.message).toContain('Colors#1234, Colors#5678');
      expect(userSafeError(r.error.message)).toBe(r.error.message);
      expect(describeAccountError('xbox-Colors', r.error.message ?? '')).toMatchObject({ kind: 'not-found', title: 'Several Xbox accounts use this gamertag' });
    }
  });
  it('resolves Name#1234 through search only (search term without the suffix)', async () => {
    f.mockResolvedValueOnce(json(search([suffixed('2535000000000001', '1234', '10'), suffixed('2535000000000002', '5678', '9000')])));
    const r = await new XboxAdapter('k').resolvePlayer('Colors#5678');
    expect(r.success && r.data).toMatchObject({ id: '2535000000000002', displayName: 'Colors#5678', gamerscore: 9000 });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toBe('https://api.xbl.io/v2/search/Colors');
  });
  it('resolves a XUID directly via /v2/player/summary', async () => {
    f.mockResolvedValueOnce(json({ code: 200, content: { people: [NF_COLOURS] } }));
    const r = await new XboxAdapter('k').resolvePlayer('2533274905149172');
    expect(r.success && r.data).toMatchObject({ id: '2533274905149172', displayName: 'nF Colours', gamerscore: 22195 });
    expect(String(f.mock.calls[0][0])).toBe('https://api.xbl.io/v2/player/summary/2533274905149172');
  });
});

describe('Xbox input forms', () => {
  it('accepts gamertag, gamertag#suffix and a 16-digit XUID; still rejects junk', () => {
    for (const ok of ['nF Colors', 'nF Colors#1234', '2533274905149172']) {
      expect(normalizeXboxInput(ok)).toEqual({ success: true, identifier: ok });
      expect(validateGamertag(ok).valid).toBe(true);
    }
    for (const bad of ['nF Colors#', '#1234', 'Test@User', 'a'.repeat(16), '12345678901234567', 'x#12a']) {
      expect(normalizeXboxInput(bad).success).toBe(false);
      expect(validateGamertag(bad).valid).toBe(false);
    }
  });
  it('/api/profile accepts a XUID and a #suffix without a 400', async () => {
    f.mockResolvedValueOnce(json({ code: 200, content: { people: [NF_COLOURS] } }))
      .mockResolvedValueOnce(json({ code: 200, content: { xuid: '2533274905149172', titles: [{ titleId: '1096157379', name: 'COD: Black Ops II', type: 'Game', achievement: { currentAchievements: 90, totalAchievements: 0, currentGamerscore: 2000, totalGamerscore: 2000 } }] } }))
      .mockResolvedValueOnce(json({ code: 200, content: { statlistscollection: [] } }));
    const res = await profile(new NextRequest('http://localhost/api/profile?xbox=2533274905149172', { headers: { 'x-real-ip': '10.8.8.8' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles[0]).toMatchObject({ id: '2533274905149172', displayName: 'nF Colours', gameCount: 1 });
    expect(body.errors).toEqual({});

    f.mockResolvedValueOnce(json(search([])));
    const res2 = await profile(new NextRequest('http://localhost/api/profile?xbox=nF%20Colors%231234', { headers: { 'x-real-ip': '10.8.8.9' } }));
    expect(res2.status).toBe(200);
    expect(Object.values((await res2.json()).errors)[0]).toMatch(/not found/);
  });
});