/**
 * In-game wallet connect without extra SDKs: EIP-6963 discovery (MetaMask, Core, Rabby, ... inject
 * into iframes too) with a window.ethereum fallback. Used inside the Grotto build when the Grotto
 * embedded wallet cannot pay. The card still mints to the player's Grotto wallet (voucher.to).
 */
import { encodeFunctionData, toHex } from 'viem';
import { gamerIdCardAbi } from '@/lib/nft/abi';
import { voucherFromJson } from '@/lib/nft/voucher';
import type { VoucherResponse } from './api';

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
export interface InjectedWallet {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193;
}
export interface ChainInfo {
  chainId: number;
  chainName: string;
  symbol: string;
  rpcUrl: string;
  explorer: string | null;
}

export function discoverWallets(waitMs = 400): Promise<InjectedWallet[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);
  const found = new Map<string, InjectedWallet>();
  const onAnnounce = (e: Event) => {
    const d = (e as CustomEvent<{ info?: { uuid?: string; name?: string; icon?: string; rdns?: string }; provider?: Eip1193 }>).detail;
    if (!d?.provider || typeof d.provider.request !== 'function' || !d.info?.name) return;
    const id = d.info.rdns || d.info.uuid || d.info.name;
    const icon = typeof d.info.icon === 'string' && /^data:image\/(png|svg\+xml|webp|jpeg);/.test(d.info.icon) ? d.info.icon : undefined;
    found.set(id, { id, name: d.info.name.slice(0, 40), icon, provider: d.provider });
  };
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  return new Promise(resolve => {
    window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      const legacy = (window as unknown as { ethereum?: Eip1193 & { isMetaMask?: boolean } }).ethereum;
      if (!found.size && legacy && typeof legacy.request === 'function') {
        found.set('injected', { id: 'injected', name: legacy.isMetaMask ? 'MetaMask' : 'Browser wallet', provider: legacy });
      }
      resolve([...found.values()]);
    }, waitMs);
  });
}

async function ensureChain(p: Eip1193, c: ChainInfo) {
  const hex = toHex(c.chainId);
  const current = (await p.request({ method: 'eth_chainId' })) as string;
  if (typeof current === 'string' && Number(current) === c.chainId) return;
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e) {
    const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code ?? (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code;
    if (code !== 4902) throw e;
    await p.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: hex, chainName: c.chainName, rpcUrls: [c.rpcUrl],
        nativeCurrency: { name: c.symbol, symbol: c.symbol, decimals: 18 },
        ...(c.explorer ? { blockExplorerUrls: [c.explorer] } : {}),
      }],
    });
  }
}

/** Connects `w`, switches it to the mint chain and sends `mint` paying the voucher price. */
export async function payNativeMint(w: InjectedWallet, chain: ChainInfo, v: VoucherResponse): Promise<`0x${string}`> {
  const accounts = (await w.provider.request({ method: 'eth_requestAccounts' })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error('No account was shared by the wallet');
  await ensureChain(w.provider, chain);
  const voucher = voucherFromJson(v.voucher);
  const data = encodeFunctionData({ abi: gamerIdCardAbi, functionName: 'mint', args: [voucher, v.top6Json, v.signature] });
  const hash = (await w.provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: v.contract, data, value: toHex(voucher.price) }],
  })) as string;
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('The wallet returned an invalid transaction hash');
  return hash as `0x${string}`;
}

export function walletErrorMessage(e: unknown): string {
  const x = e as { code?: number; shortMessage?: string; message?: string };
  if (x?.code === 4001 || /reject|denied|cancel/i.test(x?.message ?? '')) return 'You cancelled in your wallet.';
  if (/insufficient/i.test(x?.message ?? '')) return 'Not enough funds in that wallet for the price plus gas.';
  return (x?.shortMessage || x?.message || 'The wallet could not send the transaction').slice(0, 200);
}
