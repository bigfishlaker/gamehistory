# GAMER.ID Card (in development, testnet only)

A soulbound card for your gamer identity: total hours, tier and your all-time Top 6, minted after a short
"forge your ID" game at `/mint`. One card per wallet; each game account can back one card at a time.
The Top 6 is locked forever at mint; hours, games and tier keep updating from GAMER.ID.

## Pieces

| Path | What |
|---|---|
| `contracts/` | Foundry project, `GamerIDCard.sol` + tests + deploy script (see `contracts/README.md`) |
| `lib/nft/` | chains (The Grotto 36463, Fuji 43113, local 31337), Top 6 canonical JSON, HMAC account keys, tiers, price quote, EIP-712 vouchers, SIWE sessions, Grotto session check, mint service, card metadata/art |
| `lib/profile/load-profile.ts` | the account loader shared by `/api/profile` and the card routes (server-side data only) |
| `app/api/nft/*` | API routes (below) |
| `app/mint/` | `/mint` (game), `/mint/pay/[id]` (pay a voucher with any wallet), `/mint/card/[id]` (share page) |
| `components/mint/` | the Forge game, holo card, wallet panel (wagmi + RainbowKit), Grotto panel |
| `grotto/` | static Grotto build + wrapper (see `grotto/README.md`) |
| `scripts/nft-holder-export.mjs` | holder export CSV from chain data |

## API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/nft/config` | none | chain, contract, open/closed |
| `GET /api/nft/library?xbox=&steam=&psn=&epic=` | none (profile rate limit) | top 60 games by hours for the Top 6 picker |
| `GET /api/nft/quote` | none | indicative price ($5 in the native token) |
| `GET/POST/DELETE /api/nft/siwe` | none | SIWE nonce, verify (sets an HttpOnly 24h session cookie), sign out |
| `POST /api/nft/voucher` | SIWE cookie or `Bearer grs_...` | checks accounts, Top 6, wallet and account limits, quotes, signs a 15-minute EIP-712 voucher |
| `GET /api/nft/voucher/[id]` | none | voucher for the pay page (it can only mint to its `to`) |
| `POST /api/nft/confirm` | none | records the minted card from a transaction receipt (idempotent) |
| `POST /api/nft/grotto-session` | `Bearer grs_...` | Grotto wallet + existing card |
| `GET /api/nft/[id]` | none | ERC-721 metadata (`tokenURI`) |
| `GET /api/nft/[id]/image` | none | 800x1120 PNG card (next/og) |

CORS is only granted to uploaded Grotto builds (`https://g-<32 hex>.games.enterthegrotto.xyz`).
`/mint/*` has its own CSP (wallet RPCs, WalletConnect, framing by `*.games.enterthegrotto.xyz`); every other
route keeps the original strict policy.

## Trust model

- Identity is the wallet signature (SIWE) or Grotto's own session check. Game accounts are not verified
  (anyone can type any public gamertag); a "verified" badge can come later.
- The Top 6 JSON is built on the server from the loaded library (titles cleaned, covers only from platform CDNs),
  so nothing arbitrary goes on-chain.
- Account keys on-chain are `HMAC-SHA256(NFT_ACCOUNT_HMAC_SECRET, platform:id)`: the chain enforces one card per
  account without revealing gamertags. Losing this secret means existing keys can't be recomputed: back it up.
- The price is quoted on the server (HERESY/USD from GeckoTerminal, HERESY's C-Chain market, cached 60s, fails
  closed) and signed into the voucher; the owner-set on-chain floor caps the damage of a bad quote or a leaked signer key.
- Blizzard data is not used (their API terms forbid paywalling it).

## Environment

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_NFT_CHAIN_ID` | all | `43113` (Fuji preview), `36463` (The Grotto), `31337` (local) |
| `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS` | all | deployed `GamerIDCard`; without it the mint shows "not open yet" |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | all | optional; without it only browser-extension wallets are offered |
| `NFT_VOUCHER_SIGNER_PRIVATE_KEY` | server, secret | 0x + 64 hex; must match the contract's `voucherSigner` |
| `NFT_ACCOUNT_HMAC_SECRET` | server, secret | 32+ chars, stable forever per deployment |
| `NFT_SESSION_SECRET` | server, secret | 32+ chars |
| `NFT_RPC_URL` | server | optional private RPC |
| `NFT_TEST_PRICE_WEI` | server | price off The Grotto (default 0.01) |
| `NFT_NATIVE_USD_PRICE` | server | manual HERESY/USD override if the price source is down |
| `GROTTO_GAME_ID` | server | optional: only accept Grotto sessions for this game |
| `NFT_DEV_FIXTURES` | local only | `1` = offline sample library and `grs_devlocal_<address>` sessions; ignored in production builds |

Uses the existing Upstash store (`nft:*` keys: vouchers 2h, pending mints, card records, account holds, stats cache 6h).

## Local end-to-end

```bash
anvil --fork-url https://subnets.avax.network/thegrotto/mainnet/rpc --chain-id 31337
(cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url local --broadcast --private-key <anvil key 0>)
NFT_E2E_RPC=http://127.0.0.1:8545 npx vitest run test/nft-mint-service.test.ts
NEXT_PUBLIC_NFT_CHAIN_ID=31337 NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=<address> NFT_RPC_URL=http://127.0.0.1:8545 \
  NFT_VOUCHER_SIGNER_PRIVATE_KEY=<signer> NFT_ACCOUNT_HMAC_SECRET=<32+> NFT_SESSION_SECRET=<32+> NFT_DEV_FIXTURES=1 \
  npx next dev   # then open /mint?demo=1
```

## Before real mints

- Vercel Pro (Hobby is non-commercial only).
- Owner and payout wallets (hardware wallet or multisig), a fresh production signer key, a WalletConnect project id.
- Deploy on The Grotto (36463) with `minPriceWei` set to roughly 80% of $5 in HERESY and keep it updated.
