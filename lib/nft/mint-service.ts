import { randomBytes } from 'node:crypto';
import { decodeEventLog, erc20Abi, getAddress, type Address, type Hex, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { KVStore } from '@/lib/store';
import type { Game, Platform } from '@/lib/types';
import type { ProfileData, ProfileInput } from '@/lib/profile/load-profile';
import { mergeGames } from '@/lib/utils/title-merger';
import { summarizePlaytime } from '@/lib/utils/playtime';
import { gamerIdCardAbi } from './abi';
import { accountKey, uniqueAccounts, type AccountRef } from './accounts';
import type { MintConfig } from './chains';
import type { PriceQuote } from './price';
import { CARD_PRICE_USD, QUOTE_TTL_SECONDS } from './price';
import type { NftSecrets } from './server-env';
import { canonicalTop6Json, normalizeEntry, top6Hash, TOP6_SIZE } from './top6';
import {
  NATIVE_TOKEN, voucherDomain, voucherFromJson, voucherMessage, voucherToJson, voucherTypes,
  type MintVoucher, type MintVoucherJson,
} from './voucher';

/** Long-lived records (the store API needs a TTL): ~10 years. */
export const FOREVER_SECONDS = 10 * 365 * 24 * 3600;
export const VOUCHER_RECORD_TTL_SECONDS = 2 * 3600;

export const nftKeys = {
  voucher: (id: string) => `nft:voucher:${id}`,
  pending: (chainId: number, to: string) => `nft:pending:${chainId}:${to.toLowerCase()}`,
  card: (chainId: number, tokenId: string | bigint) => `nft:card:${chainId}:${tokenId}`,
  wallet: (chainId: number, addr: string) => `nft:wallet:${chainId}:${addr.toLowerCase()}`,
  account: (chainId: number, key: string) => `nft:acct:${chainId}:${key.toLowerCase()}`,
  hold: (chainId: number, key: string) => `nft:hold:${chainId}:${key.toLowerCase()}`,
  relay: (id: string) => `nft:relay:${id}`,
};

export interface CardSnapshot {
  totalMinutes: number;
  gameCount: number;
  platforms: Platform[];
  displayName: string;
}

/** Stored with the voucher, and copied to the card record once the mint lands. */
export interface VoucherRecord {
  id: string;
  chainId: number;
  contract: Address;
  voucher: MintVoucherJson;
  top6Json: string;
  signature: Hex;
  /** Inputs used to reload stats for the dynamic metadata. */
  inputs: ProfileInput;
  accounts: AccountRef[];
  snapshot: CardSnapshot;
  quote: { usd: number; nativeUsd: number | null; source: PriceQuote['source'] | 'stablecoin' };
  via: 'siwe' | 'grotto';
  createdAt: number;
}

export interface CardRecord extends Omit<VoucherRecord, 'id' | 'signature'> {
  tokenId: string;
  owner: Address;
  payer?: Address;
  txHash?: Hex;
  mintedAt: number;
}

export interface MintDeps {
  store: KVStore;
  client: PublicClient;
  config: MintConfig;
  secrets: NftSecrets;
  loadProfile: (input: ProfileInput) => Promise<ProfileData>;
  quote: (chainId: number) => Promise<PriceQuote>;
  /** Gas-only relayer for `mintWithAllowance` (see NftSecrets.relayerKey). */
  relayer?: WalletClient;
  now?: () => number;
}

/** 'native': pay the gas token with `mint`. 'token': pay the configured ERC-20 (allowance + relayer). */
export type PayMethod = 'native' | 'token';

export class MintError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

const PLATFORM_ORDER: Platform[] = ['xbox', 'steam', 'psn', 'epic'];

export function snapshotFromProfile(data: ProfileData): CardSnapshot {
  const merged = mergeGames(data.games);
  const platforms = PLATFORM_ORDER.filter(p => data.profiles.some(pr => pr.platform === p));
  const name = data.profiles[0]?.displayName ?? 'Player';
  return {
    totalMinutes: Math.max(0, summarizePlaytime(data.games, 0).totalMinutes),
    gameCount: merged.length,
    platforms,
    displayName: name.slice(0, 40),
  };
}

/** Builds the Top 6 entries from the server-loaded library, in the order the player picked. */
export function buildTop6(games: Game[], picks: string[]) {
  if (!Array.isArray(picks) || picks.length < 1 || picks.length > TOP6_SIZE) {
    throw new MintError(`Pick 1 to ${TOP6_SIZE} games`, 400, 'BAD_TOP6');
  }
  const merged = new Map(mergeGames(games).map(g => [g.normalizedTitle, g]));
  const seen = new Set<string>();
  return picks.map(key => {
    if (typeof key !== 'string' || seen.has(key)) throw new MintError('Duplicate or invalid pick', 400, 'BAD_TOP6');
    seen.add(key);
    const g = merged.get(key);
    if (!g) throw new MintError('A picked game is not in this library', 400, 'BAD_TOP6');
    return normalizeEntry({
      title: g.games[0].title,
      platforms: PLATFORM_ORDER.filter(p => g.games.some(x => x.platform === p)),
      minutes: g.totalPlaytimeMinutes,
      cover: g.coverUrl,
    });
  });
}

/**
 * Checks everything the contract will check (plus the off-chain account rules), quotes the price
 * and signs an EIP-712 voucher that mints to `to`. Anyone may pay it.
 */
export async function prepareVoucher(
  deps: MintDeps,
  req: { to: Address; input: ProfileInput; picks: string[]; via: 'siwe' | 'grotto'; pay?: PayMethod },
): Promise<VoucherRecord> {
  const { store, client, config, secrets } = deps;
  const now = deps.now?.() ?? Date.now();
  const chainId = config.chain.id;
  const to = getAddress(req.to);
  const read = <T,>(functionName: 'tokenOf' | 'mintNonce' | 'paused' | 'minPriceWei', args?: readonly unknown[]) =>
    client.readContract({ address: config.contract, abi: gamerIdCardAbi, functionName, args } as never) as Promise<T>;

  const [existing, nonce, paused, floor] = await Promise.all([
    read<bigint>('tokenOf', [to]), read<bigint>('mintNonce', [to]), read<boolean>('paused'), read<bigint>('minPriceWei'),
  ]);
  if (paused) throw new MintError('Minting is paused', 503, 'PAUSED');
  const payToken = req.pay === 'token' ? config.payToken : undefined;
  if (req.pay === 'token' && !payToken) throw new MintError('Token payments are not enabled', 400, 'TOKEN_DISABLED');
  const tokenFloor = payToken
    ? ((await client.readContract({ address: config.contract, abi: gamerIdCardAbi, functionName: 'tokenMinPrice', args: [payToken.address] })) as bigint)
    : BigInt(0);
  if (payToken && tokenFloor === BigInt(0)) throw new MintError(`${payToken.symbol} is not accepted yet`, 400, 'TOKEN_NOT_ACCEPTED');
  if (existing !== BigInt(0)) throw new MintError('This wallet already has a GAMER.ID Card', 409, 'ALREADY_MINTED');

  const data = await deps.loadProfile(req.input);
  const requested = req.input.xbox.length + req.input.steam.length + req.input.psn.length + req.input.epic.length;
  if (data.profiles.length === 0) throw new MintError('None of these accounts could be loaded', 400, 'NO_ACCOUNTS');
  if (data.profiles.length < requested) {
    const why = Object.values(data.errors)[0];
    throw new MintError(`Some accounts could not be loaded${why ? `: ${why}` : ''}`, 400, 'ACCOUNT_LOAD_FAILED');
  }

  const accounts = uniqueAccounts(data.profiles.map(p => ({ platform: p.platform, id: p.id })));
  const keys = accounts.map(a => accountKey(a, secrets.accountHmacSecret));

  // One card per game account: check the chain (source of truth) and hold the keys for this wallet
  // while the voucher is valid so two wallets can't race with the same account.
  const linked = await Promise.all(keys.map(k =>
    client.readContract({ address: config.contract, abi: gamerIdCardAbi, functionName: 'accountCard', args: [k] }) as Promise<bigint>));
  if (linked.some(id => id !== BigInt(0))) throw new MintError('One of these game accounts is already on another GAMER.ID Card', 409, 'ACCOUNT_LINKED');
  const deadline = BigInt(Math.floor(now / 1000) + QUOTE_TTL_SECONDS);
  for (const k of keys) {
    const holder = await store.get<string>(nftKeys.hold(chainId, k));
    if (holder && holder.toLowerCase() !== to.toLowerCase()) {
      throw new MintError('One of these game accounts is being minted by another wallet right now', 409, 'ACCOUNT_HELD');
    }
  }
  for (const k of keys) await store.set(nftKeys.hold(chainId, k), to, QUOTE_TTL_SECONDS + 60);

  const entries = buildTop6(data.games, req.picks);
  let top6Json: string;
  try {
    top6Json = canonicalTop6Json(entries);
  } catch (e) {
    throw new MintError((e as Error).message, 400, 'BAD_TOP6');
  }

  let price: bigint;
  let quoteInfo: VoucherRecord['quote'];
  if (payToken) {
    // A USD stablecoin: $5 is exact, no oracle needed. The on-chain floor still applies.
    const exact = BigInt(CARD_PRICE_USD) * BigInt(10) ** BigInt(payToken.decimals);
    price = exact > tokenFloor ? exact : tokenFloor;
    quoteInfo = { usd: CARD_PRICE_USD, nativeUsd: null, source: 'stablecoin' };
  } else {
    const quote = await deps.quote(chainId).catch(() => {
      throw new MintError('Price is unavailable right now, please try again in a minute', 503, 'NO_PRICE');
    });
    price = quote.priceWei > floor ? quote.priceWei : floor;
    quoteInfo = { usd: quote.usd, nativeUsd: quote.nativeUsd, source: quote.source };
  }

  const voucher: MintVoucher = {
    to, top6Hash: top6Hash(top6Json), accountKeys: keys, payToken: payToken?.address ?? NATIVE_TOKEN, price, nonce, deadline,
  };
  const account = privateKeyToAccount(secrets.voucherSignerKey);
  const signature = await account.signTypedData({
    domain: voucherDomain(chainId, config.contract),
    types: voucherTypes,
    primaryType: 'MintVoucher',
    message: voucherMessage(voucher),
  });

  const record: VoucherRecord = {
    id: randomBytes(12).toString('base64url'),
    chainId,
    contract: config.contract,
    voucher: voucherToJson(voucher),
    top6Json,
    signature,
    inputs: req.input,
    accounts,
    snapshot: snapshotFromProfile(data),
    quote: quoteInfo,
    via: req.via,
    createdAt: now,
  };
  await store.set(nftKeys.voucher(record.id), record, VOUCHER_RECORD_TTL_SECONDS);
  await store.set(nftKeys.pending(chainId, to), record.id, VOUCHER_RECORD_TTL_SECONDS);
  return record;
}

/**
 * POST /api/nft/relay-mint: after the player approved the pay token from their own wallet (inside
 * The Grotto: one zero-value `approve` through the host transaction relay), our gas-only relayer
 * submits `mintWithAllowance`. The contract pulls the token from `v.to`, never from the relayer.
 * Only the voucher's own wallet may ask, and each voucher is relayed at most once.
 */
export async function relayMint(deps: MintDeps, req: { voucherId: string; caller: Address }): Promise<{ txHash: Hex }> {
  const { store, client, config, relayer } = deps;
  if (!relayer?.account) throw new MintError('Relayed minting is not enabled', 503, 'RELAY_DISABLED');
  const rec = /^[A-Za-z0-9_-]{8,64}$/.test(req.voucherId) ? await store.get<VoucherRecord>(nftKeys.voucher(req.voucherId)) : null;
  if (!rec || rec.chainId !== config.chain.id || rec.contract.toLowerCase() !== config.contract.toLowerCase()) {
    throw new MintError('This mint link has expired. Start again to get a fresh price.', 404, 'VOUCHER_NOT_FOUND');
  }
  const v = voucherFromJson(rec.voucher);
  if (v.to.toLowerCase() !== req.caller.toLowerCase()) throw new MintError('This voucher belongs to another wallet', 403, 'NOT_YOURS');
  if (v.payToken === NATIVE_TOKEN || !config.payToken || v.payToken.toLowerCase() !== config.payToken.address.toLowerCase()) {
    throw new MintError('This voucher is not a token payment', 400, 'NOT_TOKEN_VOUCHER');
  }
  const done = await store.get<Hex>(nftKeys.relay(req.voucherId));
  if (done) return { txHash: done };
  const nowSec = BigInt(Math.floor((deps.now?.() ?? Date.now()) / 1000));
  if (nowSec > v.deadline) throw new MintError('This price expired. Start again to get a fresh one.', 410, 'EXPIRED');
  const [allowance, balance] = await Promise.all([
    client.readContract({ address: v.payToken, abi: erc20Abi, functionName: 'allowance', args: [v.to, config.contract] }) as Promise<bigint>,
    client.readContract({ address: v.payToken, abi: erc20Abi, functionName: 'balanceOf', args: [v.to] }) as Promise<bigint>,
  ]);
  if (balance < v.price) throw new MintError(`Not enough ${config.payToken.symbol} in this wallet`, 402, 'INSUFFICIENT_FUNDS');
  if (allowance < v.price) throw new MintError('Waiting for your approval to confirm', 409, 'ALLOWANCE_PENDING');

  const { request } = await client.simulateContract({
    account: relayer.account, address: config.contract, abi: gamerIdCardAbi, functionName: 'mintWithAllowance',
    args: [v, rec.top6Json, rec.signature],
  }).catch((e: unknown) => {
    throw new MintError(`The mint would fail: ${(e as { shortMessage?: string }).shortMessage ?? 'reverted'}`, 400, 'MINT_WOULD_FAIL');
  });
  const txHash = await relayer.writeContract({ ...request, chain: config.chain } as never);
  await store.set(nftKeys.relay(req.voucherId), txHash, VOUCHER_RECORD_TTL_SECONDS);
  return { txHash };
}

/** Turns a pending voucher into a permanent card record once the token exists on-chain. */
export async function materializeCard(
  deps: Pick<MintDeps, 'store' | 'config' | 'now'>,
  ev: { tokenId: bigint; to: Address; payer?: Address; top6Hash: Hex; txHash?: Hex },
): Promise<CardRecord | null> {
  const { store, config } = deps;
  const chainId = config.chain.id;
  const existing = await store.get<CardRecord>(nftKeys.card(chainId, ev.tokenId));
  if (existing) return existing;
  const id = await store.get<string>(nftKeys.pending(chainId, ev.to));
  const v = id ? await store.get<VoucherRecord>(nftKeys.voucher(id)) : null;
  if (!v || v.voucher.top6Hash.toLowerCase() !== ev.top6Hash.toLowerCase()) return null;
  const { id: _id, signature: _sig, ...rest } = v;
  void _id; void _sig;
  const card: CardRecord = {
    ...rest,
    tokenId: ev.tokenId.toString(),
    owner: getAddress(ev.to),
    ...(ev.payer ? { payer: getAddress(ev.payer) } : {}),
    ...(ev.txHash ? { txHash: ev.txHash } : {}),
    mintedAt: deps.now?.() ?? Date.now(),
  };
  await store.set(nftKeys.card(chainId, ev.tokenId), card, FOREVER_SECONDS);
  await store.set(nftKeys.wallet(chainId, ev.to), card.tokenId, FOREVER_SECONDS);
  for (const k of voucherFromJson(v.voucher).accountKeys) {
    await store.set(nftKeys.account(chainId, k), card.tokenId, FOREVER_SECONDS);
    await store.del(nftKeys.hold(chainId, k));
  }
  await store.del(nftKeys.pending(chainId, ev.to));
  return card;
}

/** POST /api/nft/confirm: reads the receipt and records every CardMinted from our contract. */
export async function confirmMintTx(deps: MintDeps, txHash: Hex): Promise<CardRecord[]> {
  const receipt = await deps.client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) throw new MintError('Transaction not found yet', 404, 'TX_PENDING');
  if (receipt.status !== 'success') throw new MintError('Transaction failed', 400, 'TX_FAILED');
  const cards: CardRecord[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== deps.config.contract.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: gamerIdCardAbi, data: log.data, topics: log.topics });
      if (ev.eventName !== 'CardMinted') continue;
      const card = await materializeCard(deps, { tokenId: ev.args.tokenId, to: ev.args.to, payer: ev.args.payer, top6Hash: ev.args.top6Hash, txHash });
      if (card) cards.push(card);
    } catch {
      // not one of our events
    }
  }
  if (!cards.length) throw new MintError('No GAMER.ID Card mint found in this transaction', 400, 'NO_MINT');
  return cards;
}

/** Loads a card record; if the confirm call never happened, rebuilds it from the chain + pending voucher. */
export async function getCard(deps: MintDeps, tokenId: bigint): Promise<CardRecord | null> {
  const chainId = deps.config.chain.id;
  const rec = await deps.store.get<CardRecord>(nftKeys.card(chainId, tokenId));
  let owner: Address;
  try {
    owner = (await deps.client.readContract({ address: deps.config.contract, abi: gamerIdCardAbi, functionName: 'ownerOf', args: [tokenId] })) as Address;
  } catch {
    return null; // never minted, or burned
  }
  if (rec) return rec.owner.toLowerCase() === owner.toLowerCase() ? rec : null;
  const [hash] = (await deps.client.readContract({ address: deps.config.contract, abi: gamerIdCardAbi, functionName: 'cardOf', args: [tokenId] })) as readonly [Hex, bigint, readonly Hex[]];
  return materializeCard(deps, { tokenId, to: owner, top6Hash: hash });
}
