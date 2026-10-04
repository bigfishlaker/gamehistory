#!/usr/bin/env node
/**
 * Holder export for the GAMER.ID Card: one CSV row per live card.
 *   node scripts/nft-holder-export.mjs --rpc <url> --contract <0x...> [--out holders.csv]
 * Reads only public chain data (ownerOf, cardOf). Burned cards are skipped.
 */
import { writeFileSync } from 'node:fs';
import { createPublicClient, http, parseAbi } from 'viem';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const rpc = arg('rpc');
const contract = arg('contract');
const out = arg('out') ?? 'holders.csv';
if (!rpc || !contract) {
  console.error('usage: node scripts/nft-holder-export.mjs --rpc <url> --contract <0x...> [--out holders.csv]');
  process.exit(1);
}
const abi = parseAbi([
  'function totalMinted() view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function cardOf(uint256) view returns (bytes32 top6Hash, uint64 mintedAt, bytes32[] accountKeys)',
]);
const client = createPublicClient({ transport: http(rpc, { fetchOptions: { headers: { 'user-agent': 'gamer-id-export/1.0' } } }) });
const total = await client.readContract({ address: contract, abi, functionName: 'totalMinted' });
const rows = ['token_id,owner,minted_at_utc,linked_accounts'];
for (let id = BigInt(1); id <= total; id++) {
  try {
    const owner = await client.readContract({ address: contract, abi, functionName: 'ownerOf', args: [id] });
    const [, mintedAt, keys] = await client.readContract({ address: contract, abi, functionName: 'cardOf', args: [id] });
    rows.push(`${id},${owner},${new Date(Number(mintedAt) * 1000).toISOString()},${keys.length}`);
  } catch {
    // burned
  }
}
writeFileSync(out, rows.join('\n') + '\n');
console.log(`${rows.length - 1} cards -> ${out}`);
