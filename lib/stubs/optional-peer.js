// Stub for optional peer dependencies that wallet SDKs import lazily but GAMER.ID never uses
// (@coinbase/cdp-sdk's x402 payment helpers, pulled in through @wagmi/connectors -> @base-org/account).
// Turbopack fails the build on unresolvable dynamic imports, so next.config.ts aliases them here.
module.exports = {};
