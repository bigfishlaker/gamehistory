import { describe, it, expect } from 'vitest';
import {
  generateShareCode,
  isValidShareCode,
  validateShareInput,
  shareRecordQuery,
  canonicalShareKey,
  shareDisplayName,
  SHARE_CODE_ALPHABET,
} from '../lib/share-links';
import { ROUTE_LIMITS } from '../lib/rate-limit';
import { POST } from '../app/api/share/route';
import { getStore } from '../lib/store';

describe('share code generator', () => {
  it('makes 8-character base62 codes', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode();
      expect(code).toMatch(/^[0-9A-Za-z]{8}$/);
      expect(isValidShareCode(code)).toBe(true);
    }
    expect(SHARE_CODE_ALPHABET).toHaveLength(62);
  });

  it('is effectively unique', () => {
    const codes = new Set(Array.from({ length: 5000 }, () => generateShareCode()));
    expect(codes.size).toBe(5000);
  });

  it('rejects bytes >= 248 to avoid modulo bias', () => {
    const bytes = [255, 250, 248, 0, 61, 62, 247, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const code = generateShareCode(8, n => Uint8Array.from(bytes.slice(0, n)));
    expect(code).toBe(['0', 'z', '0', SHARE_CODE_ALPHABET[247 % 62], '1', '2', '3', '4'].join(''));
  });

  it('validates code format', () => {
    for (const bad of ['', 'abc', 'abcdefghi', 'abc-defg', '../etc12', 42, null]) expect(isValidShareCode(bad)).toBe(false);
    expect(isValidShareCode('Ab3dE6g')).toBe(true);
  });
});

describe('share input validation', () => {
  it('accepts a public account set and normalizes it', () => {
    const r = validateShareInput({
      steam: ['https://steamcommunity.com/profiles/76561197960287930'],
      xbox: ['Stallion83'],
      off: ['steam:76561197960287930'],
      name: 'Rabscuttle',
      size: 10,
      tab: 'top6',
    }, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record).toEqual({
      v: 1, xbox: ['Stallion83'], steam: ['76561197960287930'], psn: [], off: ['steam:76561197960287930'],
      name: 'Rabscuttle', size: 10, tab: 'top6', createdAt: 1,
    });
    expect(shareRecordQuery(r.record)).toBe('xbox=Stallion83&steam=76561197960287930&off=steam%3A76561197960287930&size=10&tab=top6');
    expect(shareDisplayName(r.record)).toBe('Rabscuttle');
  });

  it('rejects bad input with the existing validators', () => {
    expect(validateShareInput({}).ok).toBe(false); // no accounts
    expect(validateShareInput({ xbox: ['<script>alert(1)</script>'] }).ok).toBe(false);
    expect(validateShareInput({ steam: ['x'] }).ok).toBe(false);
    expect(validateShareInput({ psn: ['a'] }).ok).toBe(false);
    expect(validateShareInput({ xbox: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).ok).toBe(false); // > 6
    expect(validateShareInput({ steam: ['76561197960287930'], off: ['evil'] }).ok).toBe(false);
    expect(validateShareInput({ steam: ['76561197960287930'], name: 'Buy crypto at http://x.y' }).ok).toBe(false);
    expect(validateShareInput({ steam: ['76561197960287930'], size: 7 }).ok).toBe(false);
    expect(validateShareInput({ steam: ['76561197960287930'], email: 'a@b.c' }).ok).toBe(true); // unknown keys are dropped
    expect(validateShareInput('nope').ok).toBe(false);
  });

  it('gives the same canonical key regardless of order/case', () => {
    const a = validateShareInput({ xbox: ['Stallion83'], steam: ['76561197960287930'] });
    const b = validateShareInput({ steam: ['76561197960287930'], xbox: ['stallion83'] });
    expect(a.ok && b.ok && canonicalShareKey(a.record) === canonicalShareKey(b.record)).toBe(true);
  });
});

describe('POST /api/share', () => {
  const req = (body: unknown, ip = '1.2.3.4') =>
    new Request('https://gamer-id.vercel.app/api/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as unknown as Parameters<typeof POST>[0];

  it('stores only the public account set and reuses the code for the same set', async () => {
    const res = await POST(req({ steam: ['76561197960287930'], email: 'secret@example.com' }));
    expect(res.status).toBe(201);
    const { code, url } = await res.json();
    expect(url).toBe(`https://gamer-id.vercel.app/u/${code}`);
    const stored = await getStore().get<Record<string, unknown>>(`share:${code}`);
    expect(stored).toMatchObject({ v: 1, steam: ['76561197960287930'], xbox: [], psn: [], off: [] });
    expect(JSON.stringify(stored)).not.toContain('secret');
    const again = await (await POST(req({ steam: ['76561197960287930'] }))).json();
    expect(again.code).toBe(code);
  });

  it('rejects invalid bodies', async () => {
    expect((await POST(req('{not json'))).status).toBe(400);
    expect((await POST(req({ xbox: ['bad!!'] }))).status).toBe(400);
    expect((await POST(req('x'.repeat(5000)))).status).toBe(413);
  });

  it('is rate limited per IP (share bucket, 20/hour)', async () => {
    expect(ROUTE_LIMITS.share).toEqual({ limit: 20, windowSeconds: 3600 });
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await POST(req({ psn: [`user${i}abc`] }, '9.9.9.9'))).status;
    expect(last).toBe(429);
  });
});
