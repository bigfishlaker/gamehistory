// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { corsHeaders, preflight } from '../lib/nft/route-helpers';
import { toLibrary } from '../lib/nft/library';
import { cardMetadata, formatSerial, toCardView } from '../lib/nft/card-view';
import type { CardRecord } from '../lib/nft/mint-service';
import { POST as voucherPOST } from '../app/api/nft/voucher/route';
import { GET as configGET } from '../app/api/nft/config/route';
import { GET as metaGET } from '../app/api/nft/[id]/route';

const GROTTO = `https://g-${'0123456789abcdef'.repeat(2)}.games.enterthegrotto.xyz`;
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(url, init);

afterEach(() => vi.unstubAllEnvs());

describe('CORS', () => {
  it('allows uploaded Grotto builds only', () => {
    expect(corsHeaders(req('http://x/api/nft/config', { headers: { origin: GROTTO } }))['Access-Control-Allow-Origin']).toBe(GROTTO);
    expect(corsHeaders(req('http://x/api/nft/config', { headers: { origin: 'https://evil.example' } }))).toEqual({});
    expect(preflight(req('http://x/api/nft/voucher', { method: 'OPTIONS', headers: { origin: GROTTO } })).status).toBe(204);
    expect(preflight(req('http://x/api/nft/voucher', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })).status).toBe(403);
  });
});

describe('routes when the mint is not configured', () => {
  it('config says closed and voucher/metadata refuse', async () => {
    vi.stubEnv('NEXT_PUBLIC_NFT_CHAIN_ID', '');
    expect(await (await configGET(req('http://x/api/nft/config'))).json()).toEqual({ open: false });
    expect((await voucherPOST(req('http://x/api/nft/voucher', { method: 'POST', body: '{}' }))).status).toBe(503);
    expect((await metaGET(req('http://x/api/nft/1'), { params: Promise.resolve({ id: '1' }) })).status).toBe(404);
  });

  it('voucher requires a session when configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_NFT_CHAIN_ID', '43113');
    vi.stubEnv('NEXT_PUBLIC_NFT_CONTRACT_ADDRESS', `0x${'1'.repeat(40)}`);
    vi.stubEnv('NFT_VOUCHER_SIGNER_PRIVATE_KEY', `0x${'2'.repeat(64)}`);
    vi.stubEnv('NFT_ACCOUNT_HMAC_SECRET', 'h'.repeat(32));
    vi.stubEnv('NFT_SESSION_SECRET', 's'.repeat(32));
    const res = await voucherPOST(req('http://x/api/nft/voucher', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('metadata ids are validated', async () => {
    for (const id of ['0', 'abc', '01', '1'.repeat(11)]) {
      expect((await metaGET(req(`http://x/api/nft/${id}`), { params: Promise.resolve({ id }) })).status).toBe(404);
    }
  });
});

describe('library + metadata shaping', () => {
  it('sorts by hours and keeps only safe covers', () => {
    const lib = toLibrary({
      profiles: [{ id: '1', displayName: 'P', platform: 'steam' }],
      games: [
        { id: 'a', title: 'A', platform: 'steam', playtimeMinutes: 60, coverUrl: 'https://evil.example/a.png' },
        { id: 'b', title: 'B', platform: 'steam', playtimeMinutes: 600, coverUrl: 'https://cdn.cloudflare.steamstatic.com/b.jpg' },
      ],
      playtime: { totalMinutes: 0, byPlatform: {}, topCombined: [] },
      errors: {},
    });
    expect(lib.games.map(g => g.title)).toEqual(['B', 'A']);
    expect(lib.games[1].cover).toBeUndefined();
    expect(lib.totalMinutes).toBe(660);
  });

  it('builds ERC-721 metadata with tier and Top 6 traits', () => {
    const card = {
      tokenId: '42', chainId: 43113, contract: `0x${'1'.repeat(40)}`, owner: `0x${'2'.repeat(40)}`, mintedAt: 1_800_000_000_000,
      top6Json: '{"v":1,"top6":[{"t":"Halo","p":["xbox"],"h":500}]}',
      snapshot: { totalMinutes: 1600 * 60, gameCount: 12, platforms: ['xbox'], displayName: 'Dylan' },
    } as unknown as CardRecord;
    const meta = cardMetadata(toCardView(card, card.snapshot, true), 'https://gamer-id.example');
    expect(formatSerial('42')).toBe('#000042');
    expect(meta.name).toBe('GAMER.ID #000042');
    expect(meta.image).toBe('https://gamer-id.example/api/nft/42/image?h=1600');
    expect(meta.attributes).toContainEqual({ trait_type: 'Tier', value: 'Gold' });
    expect(meta.attributes).toContainEqual({ trait_type: 'Top 1', value: 'Halo' });
  });
});
