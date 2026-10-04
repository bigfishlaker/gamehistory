import type { LibraryResponse } from '@/lib/nft/library';
import type { MintVoucherJson } from '@/lib/nft/voucher';
import type { CardSnapshot } from '@/lib/nft/mint-service';

export type AccountsInput = { xbox: string[]; steam: string[]; psn: string[]; epic: string[] };

export interface VoucherResponse {
  id: string;
  chainId: number;
  contract: `0x${string}`;
  voucher: MintVoucherJson;
  top6Json: string;
  signature: `0x${string}`;
  price: string;
  symbol: string;
  snapshot: CardSnapshot;
  payUrl: string;
}

export interface MintedCard {
  tokenId: string;
  cardUrl: string;
  image: string;
}

/** Thin client for the card API. `base` is '' on GAMER.ID and the site origin in the Grotto build. */
export class ForgeApi {
  private auth: string | undefined;

  constructor(readonly base: string) {}

  /** e.g. `Bearer grs_...` inside The Grotto. Kept in memory only. */
  setAuthorization(value: string | undefined) {
    this.auth = value;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const auth = this.auth;
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      credentials: this.base ? 'omit' : 'same-origin',
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...init?.headers },
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!res.ok) {
      const err = new Error(body.error || `Request failed (${res.status})`) as Error & { status?: number; code?: string };
      err.status = res.status;
      err.code = body.code;
      throw err;
    }
    return body;
  }

  library(a: AccountsInput) {
    const q = new URLSearchParams();
    (Object.keys(a) as (keyof AccountsInput)[]).forEach(k => a[k].forEach(v => q.append(k, v)));
    return this.call<LibraryResponse>(`/api/nft/library?${q}`);
  }
  config() {
    return this.call<{ open: boolean; chainId?: number; chainName?: string; contract?: `0x${string}`; symbol?: string; explorer?: string | null }>('/api/nft/config');
  }
  quote() {
    return this.call<{ price: string; symbol: string; usd: number; source: string }>('/api/nft/quote');
  }
  voucher(accounts: AccountsInput, top6: string[]) {
    return this.call<VoucherResponse>('/api/nft/voucher', { method: 'POST', body: JSON.stringify({ accounts, top6 }) });
  }
  confirm(txHash: string) {
    return this.call<{ cards: MintedCard[] }>('/api/nft/confirm', { method: 'POST', body: JSON.stringify({ txHash }) });
  }
  grottoSession() {
    return this.call<{ wallet: `0x${string}`; displayName: string | null; tokenId: string | null }>('/api/nft/grotto-session', { method: 'POST' });
  }
  siweNonce() {
    return this.call<{ nonce: string; address: string | null }>('/api/nft/siwe');
  }
  siweVerify(message: string, signature: string) {
    return this.call<{ address: string }>('/api/nft/siwe', { method: 'POST', body: JSON.stringify({ message, signature }) });
  }
  cardUrls(tokenId: string): MintedCard {
    return { tokenId, cardUrl: `${this.base || ''}/mint/card/${tokenId}`, image: `${this.base}/api/nft/${tokenId}/image` };
  }
}
