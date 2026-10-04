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
| `gamer-id-forge-static.zip` | **Recommended.** Self-contained build (`index.html` at the zip root + `app.js` + `app.css`, about 70 KB). The game runs on Grotto's isolated origin (`g-<hex>.games.enterthegrotto.xyz`) and calls the GAMER.ID API with CORS. |
| `gamer-id-forge-wrapper.zip` | Alternative. A 2 KB `index.html` that frames `<host>/mint?embed=grotto` and forwards only the runtime handshake (exact origins both ways). UI changes ship with a normal Vercel deploy, no re-upload. |
| `build-info.json` | API base, game URL, sizes and SHA-256 of both zips. |

## How it works inside The Grotto

1. The Grotto gives the game a runtime session (`grs_...`) through `postMessage`
   (`components/mint/grotto-runtime.ts`, same protocol as `grotto-game-runtime.v1.js`; the session stays in memory).
2. The game sends `Authorization: Bearer grs_...` to `POST /api/nft/grotto-session` and `/api/nft/voucher`.
   The GAMER.ID server checks the session with `GET https://api.enterthegrotto.xyz/api/game-runtime/v1/session/me`
   and uses **the wallet Grotto returns** (the player's Privy embedded wallet) as the card recipient. A wallet
   address sent by the browser is never trusted. Optional: set `GROTTO_GAME_ID` so sessions from other games are refused.
3. Grotto games cannot ask the embedded wallet to sign or pay: the runtime SDK has no wallet API, and the
   undocumented host transaction relay (`bobert:tx`) only works with a per-build policy that Grotto sets,
   forces `value = 0` and caps gas at 100,000. A mint uses about 210k to 580k gas and needs a $5 payment, so the relay can't do it today.
   Instead the game shows **"Pay with a wallet"**, which opens `/mint/pay/<voucher id>` on GAMER.ID. Any wallet
   (desktop MetaMask, phone, a friend) pays the voucher; the contract mints to the Grotto wallet. The game
   polls and plays the reveal by itself, then posts the player's total hours to the Grotto leaderboard `hours`.
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
   loads, "Forge my card" returns a pay link, paying it from another wallet makes the reveal play.
6. Only then press **Publish** (or "Edit Draft" to fix something and upload again).

Ask Grotto (open questions):

- Upload size limit for builds (not documented; our zips are about 70 KB and 2 KB).
- The game iframe's `sandbox`/CSP: is `allow-popups` set (needed for "Pay with a wallet"; the link is also shown as text to copy)? Are cross-origin `fetch` calls to our API allowed (the static build needs them)?
- Whether they would approve a transaction-relay policy for this build (USDC `approve` + `mint`) with a higher gas cap,
  which would let players pay from the embedded wallet without leaving the game.
- Whether external ERC-721s can get a collection page, and how their indexer refreshes metadata (no ERC-4906 support found).
