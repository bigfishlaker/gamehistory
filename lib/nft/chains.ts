import { defineChain, type Address, type Chain } from 'viem';
import { avalancheFuji } from 'viem/chains';

/**
 * The Grotto L1 (Avalanche). Gas token HERESY (18 decimals).
 * Public RPC sits behind Cloudflare; server-side calls must send a User-Agent.
 */
export const grotto = defineChain({
  id: 36463,
  name: 'The Grotto',
  nativeCurrency: { name: 'HERESY', symbol: 'HERESY', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://subnets.avax.network/thegrotto/mainnet/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Avalanche Explorer', url: 'https://subnets.avax.network/thegrotto' },
  },
});

/** Avalanche Fuji C-Chain testnet (43113), used for the preview deployment. */
export const fuji: Chain = avalancheFuji;

/** Local anvil (fork of The Grotto, chain id overridden to 31337 so nothing signed locally is valid on mainnet). */
export const localFork = defineChain({
  id: 31337,
  name: 'Local Grotto fork',
  nativeCurrency: { name: 'HERESY', symbol: 'HERESY', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

export const SUPPORTED_CHAINS = [grotto, fuji, localFork] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]['id'];

export function chainById(id: number): Chain | undefined {
  return SUPPORTED_CHAINS.find(c => c.id === id);
}

export interface MintConfig {
  chain: Chain;
  contract: Address;
  /** RPC used by the server (may differ from the public one, e.g. a keyed endpoint). */
  rpcUrl: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Public mint configuration (safe for the browser): NEXT_PUBLIC_NFT_CHAIN_ID and
 * NEXT_PUBLIC_NFT_CONTRACT_ADDRESS. Returns null when the mint is not configured.
 */
export function publicMintConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_NFT_CHAIN_ID: process.env.NEXT_PUBLIC_NFT_CHAIN_ID,
  NEXT_PUBLIC_NFT_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS,
  NFT_RPC_URL: process.env.NFT_RPC_URL,
}): MintConfig | null {
  const chain = chainById(Number(env.NEXT_PUBLIC_NFT_CHAIN_ID));
  const contract = env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS?.trim();
  if (!chain || !contract || !ADDRESS_RE.test(contract)) return null;
  return { chain, contract: contract as Address, rpcUrl: env.NFT_RPC_URL?.trim() || chain.rpcUrls.default.http[0] };
}
