import path from "node:path";
import type { NextConfig } from "next";

// Next.js dev (React Refresh / Turbopack) needs eval(); production builds do not,
// so 'unsafe-eval' is only sent in development.
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // A stray package.json/package-lock.json in C:\Users\bigfi made Turbopack warn and
  // consider inferring the home directory as the workspace root. Pin it to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
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
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
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
