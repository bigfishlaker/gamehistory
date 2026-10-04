# GAMER.ID Forge on The Grotto

The `/mint` experience ("forge your ID": pick platforms, drag your Top 6 into the slots, forge, reveal) is
also packaged as a Grotto game. Nothing in this folder publishes anything; it only builds the upload.

```bash
npm run grotto:build                                   # API at https://gamer-id.vercel.app
GROTTO_API_BASE=https://<host> npm run grotto:build    # point at another deployment
```

Output in `grotto/dist/` (git-ignored):

| File | What it is |
|---|---|
| `gamer-id-forge-static.zip` | **Recommended.** Self-contained build (`index.html` at the zip root + `app.js` + `app.css`, about 80 KB). The game runs on Grotto's isolated origin (`g-<hex>.games.enterthegrotto.xyz`) and calls the GAMER.ID API with CORS. |
| `gamer-id-forge-wrapper.zip` | Alternative. A 2 KB `index.html` that frames `<host>/mint?embed=grotto` and forwards only the runtime handshake (exact origins both ways). UI changes ship with a normal Vercel deploy, no re-upload. |
| `build-info.json` | API base, game URL, sizes and SHA-256 of both zips. |

## How it works inside The Grotto

1. The Grotto gives the game a runtime session (`grs_...`) through `postMessage`
   (`components/mint/grotto-runtime.ts`, same protocol as `grotto-game-runtime.v1.js`; the session stays in memory).
2. The game sends `Authorization: Bearer grs_...` to `POST /api/nft/grotto-session` and `/api/nft/voucher`.
   The GAMER.ID server checks the session with `GET https://api.enterthegrotto.xyz/api/game-runtime/v1/session/me`
   and uses **the wallet Grotto returns** (the player's Privy embedded wallet) as the card recipient. A wallet
   address sent by the browser is never trusted. Optional: set `GROTTO_GAME_ID` so sessions from other games are refused.
3. **Pay + mint happen inside the game.** After the reveal preview the game offers, best first:
   - **"Pay $5 USDC with my Grotto wallet"** (the player's Privy embedded wallet). The public runtime SDK has no
     wallet API, but the Grotto page has an undocumented transaction relay: the game posts
     `{ type: 'bobert:tx', requestId, version: 1, chainId: 36463, tx: { to, data } }` and Grotto asks the
     embedded wallet to send it, **only** if Grotto has set a `transaction_relay` policy for this exact build
     (its SHA-256) listing the target contract + 4-byte selector; `value` must be 0 and gas is fixed at 100,000.
     `mint` can't fit (it needs a payment and ~160k-580k gas), so the game sends one relayed
     `USDC.approve(card, 5 USDC)` (46k gas), then our server's gas-only relayer calls
     `mintWithAllowance`, which pulls the 5 USDC from the player's wallet and mints to it
     (`components/mint/grotto-relay.ts`, `POST /api/nft/relay-mint`). The game reads its own policy from
     `GET {apiBaseUrl}/transaction-relay-policy` and only shows this button when the policy allows it.
   - **"Pay with <wallet>"**: any browser wallet that injects into the game frame (EIP-6963 / `window.ethereum`:
     MetaMask, Core, Rabby...). It pays HERESY with `mint`; the card still goes to the Grotto wallet.
   - **"Pay from another tab or phone"**: opens `/mint/pay/<voucher id>` on GAMER.ID (any wallet pays).
   In every case the game polls, plays the reveal by itself, then posts total hours to the Grotto leaderboard `hours`.
4. The voucher is bound to the Grotto wallet, the Top 6 hash, the linked game accounts, the price and a 15-minute deadline.

## Publishing steps (for Dylan; not done by the agent)

Before uploading:

- [ ] The card API is live on the host the build points at, with production env vars (see `docs/GAMER_ID_CARD.md`),
      and the contract is deployed on the chain the API is set to (The Grotto 36463 for real mints).
- [ ] If you point a build at a **Vercel preview** URL, turn off Vercel Deployment Protection for that deployment
      (or use a protection-bypass setup), otherwise every call from the game gets Vercel's 401 login page.
- [ ] `npm run grotto:build` with `GROTTO_API_BASE` set to that host. Check `grotto/dist/build-info.json`.

On enterthegrotto.xyz, signed in as the publishing account:

1. **Market → Create → Game: "Publish a playable build"** (not "Build a game with Studio").
2. Step 1, details: name (e.g. "GAMER.ID Forge"), genre (e.g. Casual), short description, cover/thumbnail
   (use `/workspace/nft/08-revealed.png` or a fresh capture), optional trailer. Skip "Submit to Game Jam".
3. Step 2, files and licensing: upload `grotto/dist/gamer-id-forge-static.zip` (or the wrapper zip), license **Free**
   (the card is paid separately on-chain; there is no Grotto fee on an external contract mint).
4. Step 3: wait for "File processed". The game is saved as a **private draft**.
5. Open **Test Your Game** on the draft page. Check: the Grotto wallet pill shows your wallet, your library
   loads, the pay options appear, and paying (browser wallet or pay link) makes the reveal play. The Grotto-wallet
   button only appears once Grotto has approved the relay policy for this build's SHA-256 (see `build-info.json`).
6. Only then press **Publish** (or "Edit Draft" to fix something and upload again).

Ask Grotto (open questions):

- Upload size limit for builds (not documented; our zips are about 80 KB and 2 KB).
- The game iframe's `sandbox`/CSP: is `allow-popups` set (needed for "Pay with a wallet"; the link is also shown as text to copy)? Are cross-origin `fetch` calls to our API allowed (the static build needs them)?
- **Transaction-relay policy for this build** (needed for "Pay with my Grotto wallet"): exactly one call,
  `{ to: <Grotto USDC address, lowercase>, selectors: ["0x095ea7b3"] }` (ERC-20 `approve`), bound to the static zip's
  SHA-256 from `build-info.json`. Every re-upload changes the hash, so the policy must be re-approved per build.
  Optional ask: a higher gas cap / non-zero value so `mint` could be sent directly (not needed with the approve flow).
- Whether the game iframe lets browser-extension wallets inject (it does in our local stand-in; extensions inject
  into all frames) and whether `allow-popups` is set for the pay link.
- Whether external ERC-721s can get a collection page, and how their indexer refreshes metadata (no ERC-4906 support found).
