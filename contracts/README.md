# GamerIDCard (Foundry)

Soulbound ERC-721 for GAMER.ID cards. OpenZeppelin v5, Solidity 0.8.30, EVM `cancun`
(The Grotto L1 runs subnet-evm with Cancun enabled).

| | |
|---|---|
| Standard | ERC-721 + ERC-5192 (soulbound, `locked()` is always true) + ERC-4906 (metadata refresh events) |
| Supply rule | one card per wallet (`tokenOf`), each game account on one card at a time (`accountCard`) |
| Mint | `mint(voucher, top6Json, signature)`: EIP-712 voucher signed by the GAMER.ID server; anyone may pay, the card goes to `voucher.to` |
| Top 6 | `keccak256(top6Json)` must equal `voucher.top6Hash`; the JSON is emitted in `CardMinted` and never changes |
| Price | exact `voucher.price` in the native token (or an accepted ERC-20), never below the owner-set floor (`minPriceWei` / `tokenMinPrice`) |
| Metadata | `tokenURI = baseURI + id` (HTTPS, served by `/api/nft/[id]`); `refreshMetadata` (owner or refresher) emits ERC-4906 events |
| Admin | `Ownable2Step`, `Pausable`; signer, refresher, payout, floors and base URI are owner-set; `withdraw()` sends to `payoutAddress` |

## Setup

Solidity dependencies come from npm (no git submodules):

```bash
cd contracts
npm install          # @openzeppelin/contracts 5.6.1, forge-std 1.10.0
forge build
forge test           # 47 tests, 12 fuzz tests x 1024 runs (FOUNDRY_PROFILE=ci for 10000 runs)
forge test --gas-report
```

Gas (from `forge test --gas-report` and the local end-to-end test): `mint` costs about 210k gas (median) and
up to about 580k with 8 linked accounts and a long Top 6. A typical mint with 2 accounts and 3 games used
310,755 gas on the local fork. Runtime bytecode is 17,612 bytes (limit 24,576).

## Deploy

`script/Deploy.s.sol` reads its configuration from the environment and never hard-codes keys:

| Variable | Meaning |
|---|---|
| `GAMERID_VOUCHER_SIGNER` | address of the server's voucher key (required) |
| `GAMERID_MIN_PRICE_WEI` | native price floor (required) |
| `GAMERID_BASE_URI` | e.g. `https://gamer-id.vercel.app/api/nft/` (required, trailing slash) |
| `GAMERID_OWNER` | final owner (defaults to the deployer; a different owner must call `acceptOwnership()`) |
| `GAMERID_PAYOUT` | where `withdraw()` sends funds (defaults to the owner) |
| `GAMERID_REFRESHER` | optional address allowed to emit ERC-4906 refresh events |

The script writes `deployments/<chainId>.json`.

Local fork of The Grotto (chain id overridden to 31337 so nothing signed locally is valid on mainnet):

```bash
anvil --fork-url https://subnets.avax.network/thegrotto/mainnet/rpc --chain-id 31337
GAMERID_VOUCHER_SIGNER=0x... GAMERID_MIN_PRICE_WEI=1000000000000000 GAMERID_BASE_URI=http://localhost:3000/api/nft/ \
  forge script script/Deploy.s.sol:Deploy --rpc-url local --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil dev key, local only
```

Fuji (testnet) with an encrypted keystore (`cast wallet import fuji-deployer --interactive`):

```bash
GAMERID_VOUCHER_SIGNER=0x... GAMERID_MIN_PRICE_WEI=1000000000000000 GAMERID_BASE_URI=https://<preview-host>/api/nft/ \
  forge script script/Deploy.s.sol:Deploy --rpc-url fuji --broadcast --account fuji-deployer
```

The Grotto mainnet uses the same command with `--rpc-url grotto`, a hardware wallet or keystore owner, and a
production signer. Do not deploy to mainnet from a test key.

## Holder export

`node scripts/nft-holder-export.mjs --rpc <url> --contract <address>` (from the repo root) writes one CSV
row per live card (token id, owner, mint time, number of linked accounts).
