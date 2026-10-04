import path from "node:path";
import type { NextConfig } from "next";

// Next.js dev (React Refresh / Turbopack) needs eval(); production builds do not,
// so 'unsafe-eval' is only sent in development.
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // A stray package.json/package-lock.json in the home directory made Turbopack warn and
  // consider inferring the home directory as the workspace root. Pin it to this project.
  turbopack: {
    root: path.resolve(__dirname),
    // Optional peers of @coinbase/cdp-sdk (via wagmi's Base Account connector); never used here.
    resolveAlias: Object.fromEntries(
      ['@x402/core/client', '@x402/evm', '@x402/evm/exact/client', '@x402/evm/upto/client', '@x402/svm/exact/client', '@x402/extensions']
        .map(m => [m, './lib/stubs/optional-peer.js']),
    ),
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ];
    const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`;
    return [
      {
        // Every route except the GAMER.ID Card pages (/mint, /mint/...): unchanged policy.
        source: '/:path((?!mint(?:/|$)).*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          ...securityHeaders,
        ],
      },
      {
        // GAMER.ID Card pages: wallets need chain RPCs and WalletConnect, and /mint can be
        // framed by the uploaded Grotto game wrapper (g-<hex>.games.enterthegrotto.xyz).
        source: '/mint/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' https://fonts.reown.com",
              [
                "connect-src 'self'",
                'https://subnets.avax.network',
                'https://api.avax-test.network',
                'https://api.avax.network',
                ...(isDev ? ['http://127.0.0.1:8545', 'ws://127.0.0.1:8545'] : []),
                'https://*.walletconnect.com', 'wss://*.walletconnect.com',
                'https://*.walletconnect.org', 'wss://*.walletconnect.org',
                'https://*.reown.com', 'wss://*.reown.com',
                'https://*.web3modal.org', 'https://*.web3modal.com',
                'https://*.coinbase.com', 'wss://*.coinbase.com',
                'https://api.enterthegrotto.xyz',
              ].join(' '),
              'frame-src https://verify.walletconnect.com https://verify.walletconnect.org https://*.reown.com',
              `frame-ancestors 'self' https://*.games.enterthegrotto.xyz https://enterthegrotto.xyz https://www.enterthegrotto.xyz${isDev ? ' http://localhost:*' : ''}`,
            ].join('; '),
          },
          ...securityHeaders,
        ],
      },
    ];
  },
  images: {
    // The Top 6 grid proxies covers through /api/image?url=... (so html-to-image can
    // export them same-origin). next/image rejects local src values with a query
    // string unless they match localPatterns; omitting `search` allows any query.
    localPatterns: [
      {
        pathname: '/api/image',
      },
      {
        pathname: '/**',
        search: '',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.cloudflare.steamstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'media.steampowered.com',
      },
      {
        protocol: 'https',
        hostname: '*.xboxlive.com',
      },
      {
        protocol: 'https',
        hostname: 'images-eds-ssl.xboxlive.com',
      },
      {
        protocol: 'https',
        hostname: 'store-images.s-microsoft.com',
      },
      {
        protocol: 'https',
        hostname: 'image.api.playstation.com',
      },
      {
        protocol: 'https',
        hostname: 'psnobj.prod.dl.playstation.net',
      },
    ],
  },
};

export default nextConfig;
