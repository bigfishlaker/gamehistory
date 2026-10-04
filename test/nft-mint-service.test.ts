// @vitest-environment node
/**
 * GAMER.ID Card mint service.
 * - Unit tests with a fake chain (always run).
 * - End-to-end against a local anvil (fork of The Grotto) when NFT_E2E_RPC is set and the Foundry
 *   artifact exists (cd contracts && forge build):
 *     anvil --fork-url https://subnets.avax.network/thegrotto/mainnet/rpc --chain-id 31337
 *     NFT_E2E_RPC=http://127.0.0.1:8545 npx vitest run test/nft-mint-service.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPublicClient, createWalletClient, http, recoverTypedDataAddress, type Address, type Hex, type PublicClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { MemoryStore } from '../lib/store';
import type { ProfileData, ProfileInput } from '../lib/profile/load-profile';
import type { Game } from '../lib/types';
import { gamerIdCardAbi } from '../lib/nft/abi';
import { localFork } from '../lib/nft/chains';
import { quoteCardPrice } from '../lib/nft/price';
import { confirmMintTx, getCard, MintError, nftKeys, prepareVoucher, type MintDeps } from '../lib/nft/mint-service';
import { cardMetadata, toCardView } from '../lib/nft/card-view';
import { voucherDomain, voucherFromJson, voucherMessage, voucherTypes } from '../lib/nft/voucher';

const game = (title: string, platform: Game['platform'], minutes: number): Game => ({ id: title, title, platform, playtimeMinutes: minutes, coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg' });

function fakeProfile(input: ProfileInput): ProfileData {
  const profiles = [
    ...input.xbox.map(t => ({ id: `xuid-${t.toLowerCase()}`, displayName: t, platform: 'xbox' as const })),
    ...input.steam.map(s => ({ id: s, displayName: `steam ${s}`, platform: 'steam' as const })),
  ];
  const games = [game('Halo Infinite', 'xbox', 600 * 60), game('Portal 2', 'steam', 40 * 60), game('Elden Ring', 'steam', 300 * 60), game('Elden Ring', 'xbox', 20 * 60)];
  return { profiles, games, playtime: { totalMinutes: 0, byPlatform: {}, topCombined: [] }, errors: {} };
}

const SECRETS = (key: Hex) => ({ voucherSignerKey: key, accountHmacSecret: 'h'.repeat(32), sessionSecret: 's'.repeat(32) });

function fakeClient(state: { tokenOf?: bigint; linked?: boolean; paused?: boolean } = {}): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'tokenOf': return state.tokenOf ?? BigInt(0);
        case 'mintNonce': return BigInt(0);
        case 'paused': return state.paused ?? false;
        case 'minPriceWei': return BigInt(10) ** BigInt(15);
        case 'accountCard': return state.linked ? BigInt(7) : BigInt(0);
        default: throw new Error(functionName);
      }
    },
  } as unknown as PublicClient;
}

function unitDeps(client: PublicClient, key = generatePrivateKey()): MintDeps {
  return {
    store: new MemoryStore(),
    client,
    config: { chain: localFork, contract: '0x5FbDB2315678afecb367f032d93F642f64180aa3', rpcUrl: 'http://x' },
    secrets: SECRETS(key),
    loadProfile: async i => fakeProfile(i),
    quote: id => quoteCardPrice(id, {}),
    now: () => 1_800_000_000_000,
  };
}

const TO = '0x00000000000000000000000000000000000000a1' as Address;
const INPUT: ProfileInput = { xbox: ['Dylan'], steam: ['76561197960287930'], psn: [], epic: [] };

describe('prepareVoucher (fake chain)', () => {
  it('signs a voucher the contract signer check would accept', async () => {
    const key = generatePrivateKey();
    const deps = unitDeps(fakeClient(), key);
    const rec = await prepareVoucher(deps, { to: TO, input: INPUT, picks: ['elden ring', 'halo infinite'], via: 'siwe' });
    const v = voucherFromJson(rec.voucher);
    expect(v.accountKeys).toHaveLength(2);
    expect(v.price).toBe(BigInt('10000000000000000'));
    expect(v.deadline).toBe(BigInt(1_800_000_000 + 900));
    const signer = await recoverTypedDataAddress({ domain: voucherDomain(31337, deps.config.contract), types: voucherTypes, primaryType: 'MintVoucher', message: voucherMessage(v), signature: rec.signature });
    expect(signer).toBe(privateKeyToAccount(key).address);
    expect(JSON.parse(rec.top6Json).top6.map((e: { t: string }) => e.t)).toEqual(['Elden Ring', 'Halo Infinite']);
    expect(JSON.parse(rec.top6Json).top6[0]).toMatchObject({ p: ['xbox', 'steam'], h: 320 });
    expect(rec.snapshot.totalMinutes).toBe(960 * 60);
    expect(await deps.store.get(nftKeys.pending(31337, TO))).toBe(rec.id);
  });

  it('never goes below the on-chain floor', async () => {
    const deps = unitDeps(fakeClient());
    deps.quote = async id => ({ chainId: id, priceWei: BigInt(1), usd: 5, nativeUsd: null, source: 'test-fixed', quotedAt: 0 });
    const rec = await prepareVoucher(deps, { to: TO, input: INPUT, picks: ['portal 2'], via: 'siwe' });
    expect(rec.voucher.price).toBe((BigInt(10) ** BigInt(15)).toString());
  });

  it.each([
    ['wallet already has a card', { tokenOf: BigInt(3) }, 'ALREADY_MINTED'],
    ['an account is linked to another card', { linked: true }, 'ACCOUNT_LINKED'],
    ['paused', { paused: true }, 'PAUSED'],
  ])('rejects when %s', async (_, state, code) => {
    await expect(prepareVoucher(unitDeps(fakeClient(state)), { to: TO, input: INPUT, picks: ['portal 2'], via: 'siwe' }))
      .rejects.toMatchObject({ code });
  });

  it('rejects games outside the library, duplicates and >6 picks', async () => {
    const deps = unitDeps(fakeClient());
    for (const picks of [['minecraft'], ['portal 2', 'portal 2'], Array.from({ length: 7 }, () => 'portal 2'), []]) {
      await expect(prepareVoucher(deps, { to: TO, input: INPUT, picks, via: 'siwe' })).rejects.toBeInstanceOf(MintError);
    }
  });

  it('holds accounts so a second wallet cannot race the same account', async () => {
    const deps = unitDeps(fakeClient());
    await prepareVoucher(deps, { to: TO, input: INPUT, picks: ['portal 2'], via: 'siwe' });
    await expect(prepareVoucher(deps, { to: '0x00000000000000000000000000000000000000b2', input: INPUT, picks: ['portal 2'], via: 'siwe' }))
      .rejects.toMatchObject({ code: 'ACCOUNT_HELD' });
    // the same wallet may ask again (e.g. after changing its Top 6)
    await expect(prepareVoucher(deps, { to: TO, input: INPUT, picks: ['halo infinite'], via: 'siwe' })).resolves.toBeTruthy();
  });

  it('fails when an account does not load', async () => {
    const deps = unitDeps(fakeClient());
    deps.loadProfile = async i => ({ ...fakeProfile({ ...i, steam: [] }), errors: { 'steam-x': 'private' } });
    await expect(prepareVoucher(deps, { to: TO, input: INPUT, picks: ['portal 2'], via: 'siwe' })).rejects.toMatchObject({ code: 'ACCOUNT_LOAD_FAILED' });
  });
});

const RPC = process.env.NFT_E2E_RPC;
const ARTIFACT = path.join(__dirname, '../contracts/out/GamerIDCard.sol/GamerIDCard.json');
const e2e = RPC && existsSync(ARTIFACT) ? describe : describe.skip;

e2e('end-to-end on a local anvil', () => {
  // anvil's well-known public dev keys (local only).
  const OWNER = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const PAYER = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const PLAYER = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');

  it('vouchers mint, confirm and render metadata', async () => {
    const transport = http(RPC);
    const client = createPublicClient({ chain: localFork, transport }) as PublicClient;
    const wallet = (acct: typeof OWNER) => createWalletClient({ chain: localFork, transport, account: acct });
    const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { abi: unknown[]; bytecode: { object: Hex } };
    const signerKey = generatePrivateKey();
    const deployHash = await wallet(OWNER).deployContract({
      abi: artifact.abi, bytecode: artifact.bytecode.object,
      args: [OWNER.address, privateKeyToAccount(signerKey).address, OWNER.address, BigInt(10) ** BigInt(15), 'http://localhost:3000/api/nft/'],
    });
    const contract = (await client.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;
    const deps: MintDeps = { ...unitDeps(client, signerKey), config: { chain: localFork, contract, rpcUrl: RPC! }, now: () => Date.now() };

    const rec = await prepareVoucher(deps, { to: PLAYER.address, input: INPUT, picks: ['elden ring', 'halo infinite', 'portal 2'], via: 'grotto' });
    const v = voucherFromJson(rec.voucher);
    // A third party pays; the card goes to the player.
    const txHash = await wallet(PAYER).writeContract({ address: contract, abi: gamerIdCardAbi, functionName: 'mint', args: [v, rec.top6Json, rec.signature], value: v.price });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    expect(receipt.status).toBe('success');
    console.log(`[e2e] mint gas used: ${receipt.gasUsed} (3 games, 2 accounts)`);

    const [card] = await confirmMintTx(deps, txHash);
    expect(card.owner).toBe(PLAYER.address);
    expect(card.payer).toBe(PAYER.address);
    expect(await client.readContract({ address: contract, abi: gamerIdCardAbi, functionName: 'tokenOf', args: [PLAYER.address] })).toBe(BigInt(card.tokenId));

    // Metadata is available even without the confirm call (rebuilt from chain + pending voucher is covered by getCard).
    const again = await getCard(deps, BigInt(card.tokenId));
    const meta = cardMetadata(toCardView(again!, again!.snapshot, false), 'https://gamer-id.example');
    expect(meta.name).toBe('GAMER.ID #000001');
    expect(meta.attributes).toContainEqual({ trait_type: 'Top 1', value: 'Elden Ring' });
    expect(meta.attributes).toContainEqual({ trait_type: 'Tier', value: 'Silver' });

    // Same wallet again, or the same accounts on another wallet: refused before signing.
    await expect(prepareVoucher(deps, { to: PLAYER.address, input: INPUT, picks: ['portal 2'], via: 'siwe' })).rejects.toMatchObject({ code: 'ALREADY_MINTED' });
    await expect(prepareVoucher(deps, { to: PAYER.address, input: INPUT, picks: ['portal 2'], via: 'siwe' })).rejects.toMatchObject({ code: 'ACCOUNT_LINKED' });
  }, 60_000);

  it('rebuilds the card record from the chain when confirm was never called', async () => {
    const transport = http(RPC);
    const client = createPublicClient({ chain: localFork, transport }) as PublicClient;
    const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { abi: unknown[]; bytecode: { object: Hex } };
    const signerKey = generatePrivateKey();
    const w = createWalletClient({ chain: localFork, transport, account: OWNER });
    const hash = await w.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [OWNER.address, privateKeyToAccount(signerKey).address, OWNER.address, BigInt(1), 'x/'] });
    const contract = (await client.waitForTransactionReceipt({ hash })).contractAddress!;
    const deps: MintDeps = { ...unitDeps(client, signerKey), config: { chain: localFork, contract, rpcUrl: RPC! }, now: () => Date.now() };
    const rec = await prepareVoucher(deps, { to: OWNER.address, input: { ...INPUT, xbox: ['Other'] , steam: [] }, picks: ['halo infinite'], via: 'siwe' });
    const v = voucherFromJson(rec.voucher);
    const tx = await w.writeContract({ address: contract, abi: gamerIdCardAbi, functionName: 'mint', args: [v, rec.top6Json, rec.signature], value: v.price });
    await client.waitForTransactionReceipt({ hash: tx });
    const card = await getCard(deps, BigInt(1));
    expect(card?.owner).toBe(OWNER.address);
    expect(await getCard(deps, BigInt(2))).toBeNull();
  }, 60_000);
});
