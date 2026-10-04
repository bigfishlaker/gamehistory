// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAddress, keccak256, toBytes } from 'viem';
import { canonicalTop6Json, normalizeEntry, parseTop6Json, sanitizeCover, sanitizeTitle, top6Hash } from '../lib/nft/top6';
import { accountKey, canonicalAccountId, uniqueAccounts } from '../lib/nft/accounts';
import { tierForHours, nextTier, TIERS } from '../lib/nft/tier';
import { accountsHash, voucherTypes, voucherFromJson, voucherToJson } from '../lib/nft/voucher';
import { quoteCardPrice, usdToWei, fetchHeresyUsd, resetPriceCacheForTests } from '../lib/nft/price';
import { createSessionToken, readSessionToken } from '../lib/nft/session';
import { bearerSession, isGrottoGameOrigin, verifyGrottoSession } from '../lib/nft/grotto';
import { publicMintConfig } from '../lib/nft/chains';
import { parseAccountInputs } from '../lib/nft/inputs';
import { readNftSecrets } from '../lib/nft/server-env';

describe('top6 canonical JSON', () => {
  const e = (t: string, h = 10) => ({ t, p: ['steam' as const], h });

  it('is deterministic and hashes with keccak256', () => {
    const json = canonicalTop6Json([e('Halo'), e('Portal 2', 3)]);
    expect(json).toBe('{"v":1,"top6":[{"t":"Halo","p":["steam"],"h":10},{"t":"Portal 2","p":["steam"],"h":3}]}');
    expect(top6Hash(json)).toBe(keccak256(toBytes(json)));
    expect(parseTop6Json(json)?.top6).toHaveLength(2);
  });

  it('orders platforms and floors hours', () => {
    const entry = normalizeEntry({ title: '  Elden   Ring ', platforms: ['psn', 'xbox', 'steam'], minutes: 119 });
    expect(entry).toEqual({ t: 'Elden Ring', p: ['xbox', 'steam', 'psn'], h: 1 });
  });

  it('rejects empty, >6 and duplicate lists', () => {
    expect(() => canonicalTop6Json([])).toThrow();
    expect(() => canonicalTop6Json(Array.from({ length: 7 }, (_, i) => e(`G${i}`)))).toThrow();
    expect(() => canonicalTop6Json([e('Halo'), e('halo')])).toThrow(/Duplicate/);
  });

  it('strips control and bidi characters from titles', () => {
    expect(sanitizeTitle('Ha\u202Elo\u0000 3')).toBe('Halo 3');
    expect([...sanitizeTitle('x'.repeat(200))]).toHaveLength(80);
  });

  it('only keeps covers from platform CDNs', () => {
    expect(sanitizeCover('https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg')).toContain('steamstatic');
    expect(sanitizeCover('http://image.api.playstation.com/x.png')).toMatch(/^https:/);
    expect(sanitizeCover('https://evil.example/x.png')).toBeUndefined();
    expect(sanitizeCover('javascript:alert(1)')).toBeUndefined();
  });
});

describe('account keys', () => {
  it('are HMAC-SHA256 bytes32, case-insensitive per platform id', () => {
    const k1 = accountKey({ platform: 'xbox', id: '2533274800000000' }, 's'.repeat(32));
    expect(k1).toMatch(/^0x[0-9a-f]{64}$/);
    expect(accountKey({ platform: 'psn', id: 'ABC' }, 's'.repeat(32))).toBe(accountKey({ platform: 'psn', id: 'abc' }, 's'.repeat(32)));
    expect(accountKey({ platform: 'xbox', id: '1' }, 's'.repeat(32))).not.toBe(accountKey({ platform: 'steam', id: '1' }, 's'.repeat(32)));
    expect(accountKey({ platform: 'xbox', id: '1' }, 'a'.repeat(32))).not.toBe(accountKey({ platform: 'xbox', id: '1' }, 'b'.repeat(32)));
  });
  it('dedupes accounts', () => {
    expect(uniqueAccounts([{ platform: 'steam', id: '1' }, { platform: 'steam', id: '1' }])).toHaveLength(1);
    expect(canonicalAccountId({ platform: 'epic', id: ' AbC ' })).toBe('epic:abc');
  });
});

describe('tiers', () => {
  it('maps hours to tiers', () => {
    expect(tierForHours(0).id).toBe('rookie');
    expect(tierForHours(100).id).toBe('bronze');
    expect(tierForHours(9999).id).toBe('diamond');
    expect(tierForHours(50000).id).toBe('legend');
    expect(nextTier(50000)).toBeNull();
    expect(nextTier(90)).toEqual({ tier: TIERS[1], hoursLeft: 10 });
  });
});

describe('voucher typed data', () => {
  it('matches MINT_VOUCHER_TYPEHASH in the contract', () => {
    const sol = readFileSync(path.join(__dirname, '../contracts/src/GamerIDCard.sol'), 'utf8');
    const m = sol.match(/MINT_VOUCHER_TYPEHASH = keccak256\(\s*"([^"]+)"/);
    expect(m).toBeTruthy();
    const ts = `MintVoucher(${voucherTypes.MintVoucher.map(f => `${f.type} ${f.name}`).join(',')})`;
    expect(ts).toBe(m![1]);
  });
  it('hashes account keys like abi.encodePacked(bytes32[])', () => {
    const a = `0x${'11'.repeat(32)}` as const;
    const b = `0x${'22'.repeat(32)}` as const;
    expect(accountsHash([a, b])).toBe(keccak256(`0x${'11'.repeat(32)}${'22'.repeat(32)}`));
    expect(accountsHash([])).toBe(keccak256('0x'));
  });
  it('round-trips through JSON', () => {
    const v = { to: `0x${'ab'.repeat(20)}` as const, top6Hash: `0x${'01'.repeat(32)}` as const, accountKeys: [], payToken: `0x${'00'.repeat(20)}` as const, price: BigInt('10000000000000000'), nonce: BigInt(0), deadline: BigInt(1) };
    expect(voucherFromJson(JSON.parse(JSON.stringify(voucherToJson(v))))).toEqual(v);
  });
});

describe('price quote', () => {
  it('converts USD to wei, rounding up', () => {
    expect(usdToWei(5, 500)).toBe(BigInt('10000000000000000')); // 0.01
    expect(usdToWei(5, 494.075)).toBe(BigInt('10120000000000000')); // 0.010119.. -> 0.01012
    expect(() => usdToWei(5, 0)).toThrow();
  });
  it('uses a fixed test price off The Grotto', async () => {
    const q = await quoteCardPrice(43113, {});
    expect(q.source).toBe('test-fixed');
    expect(q.priceWei).toBe(BigInt('10000000000000000'));
    expect((await quoteCardPrice(43113, { NFT_TEST_PRICE_WEI: '123' })).priceWei).toBe(BigInt(123));
  });
  it('honours the env override on The Grotto', async () => {
    const q = await quoteCardPrice(36463, { NFT_NATIVE_USD_PRICE: '500' });
    expect(q.source).toBe('env');
    expect(q.priceWei).toBe(BigInt('10000000000000000'));
  });
  it('reads GeckoTerminal and fails closed on bad data', async () => {
    resetPriceCacheForTests();
    const ok = (v: string) => (async () => new Response(JSON.stringify({ data: { attributes: { token_prices: { '0x432d38f83a50ec77c409d086e97448794cf76dcf': v } } } }))) as unknown as typeof fetch;
    expect(await fetchHeresyUsd(ok('494.07'), 1)).toBeCloseTo(494.07);
    resetPriceCacheForTests();
    await expect(fetchHeresyUsd(ok('0'), 2)).rejects.toThrow();
    resetPriceCacheForTests();
    await expect(fetchHeresyUsd((async () => new Response('x', { status: 500 })) as unknown as typeof fetch, 3)).rejects.toThrow();
  });
});

describe('session cookie', () => {
  const secret = 'k'.repeat(32);
  const addr = '0x1111111111111111111111111111111111111111';
  it('round-trips and expires', () => {
    const t = createSessionToken(addr, secret, 1_000_000);
    expect(readSessionToken(t, secret, 1_000_000)).toBe(addr);
    expect(readSessionToken(t, secret, 1_000_000 + 25 * 3600 * 1000)).toBeNull();
  });
  it('rejects tampering and other secrets', () => {
    const t = createSessionToken(addr, secret);
    const [p, mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ a: '0x2222222222222222222222222222222222222222', e: 9e9 })).toString('base64url');
    expect(readSessionToken(`${forged}.${mac}`, secret)).toBeNull();
    expect(readSessionToken(`${p}.${mac}`, 'x'.repeat(32))).toBeNull();
    expect(readSessionToken(undefined, secret)).toBeNull();
  });
});

describe('Grotto runtime', () => {
  it('only allows uploaded-build origins', () => {
    expect(isGrottoGameOrigin(`https://g-${'a'.repeat(32)}.games.enterthegrotto.xyz`)).toBe(true);
    expect(isGrottoGameOrigin('https://evil.games.enterthegrotto.xyz')).toBe(false);
    expect(isGrottoGameOrigin(`http://g-${'a'.repeat(32)}.games.enterthegrotto.xyz`)).toBe(false);
    expect(isGrottoGameOrigin(`https://g-${'a'.repeat(32)}.games.enterthegrotto.xyz.evil.com`)).toBe(false);
    expect(isGrottoGameOrigin(null)).toBe(false);
  });
  it('parses bearer sessions', () => {
    expect(bearerSession('Bearer grs_abcdef123456')).toBe('grs_abcdef123456');
    expect(bearerSession('Bearer xyz')).toBeNull();
    expect(bearerSession(null)).toBeNull();
  });
  it('verifies with the fixed Grotto API and reads the wallet', async () => {
    let calledUrl = '';
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calledUrl = url;
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer grs_abcdef123456');
      return new Response(JSON.stringify({ player: { walletAddress: '0xeb78f604cc8ed0f2ba7f9344cdfa49ac233aa1ea', displayName: 'dylan' }, gameId: 'g1' }));
    }) as unknown as typeof fetch;
    const p = await verifyGrottoSession('grs_abcdef123456', { fetchImpl });
    expect(calledUrl).toBe('https://api.enterthegrotto.xyz/api/game-runtime/v1/session/me');
    expect(p?.wallet).toBe(getAddress('0xeb78f604cc8ed0f2ba7f9344cdfa49ac233aa1ea'));
    expect(await verifyGrottoSession('grs_abcdef123456', { fetchImpl, expectedGameId: 'other' })).toBeNull();
    expect(await verifyGrottoSession('grs_abcdef123456', { fetchImpl: (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch })).toBeNull();
  });
});

describe('config', () => {
  it('requires a known chain and a contract address', () => {
    expect(publicMintConfig({})).toBeNull();
    expect(publicMintConfig({ NEXT_PUBLIC_NFT_CHAIN_ID: '1', NEXT_PUBLIC_NFT_CONTRACT_ADDRESS: `0x${'1'.repeat(40)}` })).toBeNull();
    expect(publicMintConfig({ NEXT_PUBLIC_NFT_CHAIN_ID: '43113', NEXT_PUBLIC_NFT_CONTRACT_ADDRESS: 'nope' })).toBeNull();
    expect(publicMintConfig({ NEXT_PUBLIC_NFT_CHAIN_ID: '36463', NEXT_PUBLIC_NFT_CONTRACT_ADDRESS: `0x${'1'.repeat(40)}` })?.chain.name).toBe('The Grotto');
  });
  it('requires all secrets', () => {
    expect(readNftSecrets({})).toBeNull();
    expect(readNftSecrets({ NFT_VOUCHER_SIGNER_PRIVATE_KEY: `0x${'1'.repeat(64)}`, NFT_ACCOUNT_HMAC_SECRET: 'a'.repeat(32), NFT_SESSION_SECRET: 'short' })).toBeNull();
    expect(readNftSecrets({ NFT_VOUCHER_SIGNER_PRIVATE_KEY: `0x${'1'.repeat(64)}`, NFT_ACCOUNT_HMAC_SECRET: 'a'.repeat(32), NFT_SESSION_SECRET: 'b'.repeat(32) })).not.toBeNull();
  });
});

describe('account inputs', () => {
  it('normalizes like /api/profile', () => {
    const r = parseAccountInputs({ xbox: ['Major Nelson', 'major nelson'], steam: ['https://steamcommunity.com/profiles/76561197960287930'] });
    expect(r.ok && r.input).toEqual({ xbox: ['Major Nelson'], steam: ['76561197960287930'], psn: [], epic: [] });
  });
  it('rejects bad input', () => {
    expect(parseAccountInputs(null).ok).toBe(false);
    expect(parseAccountInputs({}).ok).toBe(false);
    expect(parseAccountInputs({ xbox: [1] }).ok).toBe(false);
    expect(parseAccountInputs({ steam: Array.from({ length: 7 }, (_, i) => `7656119796028793${i}`) }).ok).toBe(false);
  });
});
