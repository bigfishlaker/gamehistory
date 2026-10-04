import { createPublicClient, http, type PublicClient } from 'viem';
import type { MintConfig } from './chains';

const clients = new Map<string, PublicClient>();

/** Server-side viem client. The Grotto RPC is behind Cloudflare, which rejects requests without a User-Agent. */
export function serverPublicClient(cfg: MintConfig): PublicClient {
  const key = `${cfg.chain.id}:${cfg.rpcUrl}`;
  let c = clients.get(key);
  if (!c) {
    c = createPublicClient({
      chain: cfg.chain,
      transport: http(cfg.rpcUrl, { fetchOptions: { headers: { 'user-agent': 'gamer-id/1.0' } }, timeout: 10_000, retryCount: 1 }),
    }) as PublicClient;
    clients.set(key, c);
  }
  return c;
}
