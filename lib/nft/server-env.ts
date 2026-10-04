/** Server-only secrets for the GAMER.ID Card. Never exposed to the browser. */
export interface NftSecrets {
  /** 0x-prefixed private key of the voucher signer (preview: Fuji test key only). */
  voucherSignerKey: `0x${string}`;
  /** HMAC secret for game-account keys (on-chain keys must not reveal gamertags). */
  accountHmacSecret: string;
  /** HMAC secret for the SIWE session cookie. */
  sessionSecret: string;
}

export function readNftSecrets(env: Record<string, string | undefined> = process.env): NftSecrets | null {
  const key = env.NFT_VOUCHER_SIGNER_PRIVATE_KEY?.trim();
  const hmac = env.NFT_ACCOUNT_HMAC_SECRET?.trim();
  const session = env.NFT_SESSION_SECRET?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key) || !hmac || hmac.length < 32 || !session || session.length < 32) return null;
  return { voucherSignerKey: key as `0x${string}`, accountHmacSecret: hmac, sessionSecret: session };
}
