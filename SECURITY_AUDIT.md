# Security Audit Report
**GAMER.ID - Pre-Production Security Assessment**  
Date: September 27, 2026  
Status: HIGH/MEDIUM fixes implemented and verified 2026-09-27 (see Verified Status table)


## ✅ Verified Status (2026-09-27, checked against the code, not the original plan)

| # | Finding | Severity | Status | Where |
|---|---|---|---|---|
| 1.2 | PSN_NPSSO personal token | HIGH | ✅ Mitigated (server-only, throwaway-account docs) | `lib/adapters/index.ts`, `lib/adapters/psn-adapter.ts`, DEPLOY.md §2.3 |
| 1.3 | Secrets in git history | MEDIUM | ⚠️ Partial: not a git repo on this PC; `.gitignore` verified | `.gitignore`, `.env.example` |
| 1.4 | Build output leakage | HIGH | ✅ Verified clean | `.next/static` scan (see 1.4) |
| 2.1 / 2.5 | Rate limiting + global OpenXBL budget | HIGH | ✅ Fixed (per-IP on all /api routes, 150/h with 20 reserve, "busy" message) | `lib/rate-limit.ts`, `lib/store/index.ts`, `lib/adapters/xbox-adapter.ts`, all `app/api/**/route.ts` |
| 2.2 | Request dedup | MEDIUM | ✅ Fixed | `lib/rate-limit.ts` `dedupe`, `app/api/profile/route.ts`, `app/api/achievements/route.ts` |
| 2.3 | Response cache | MEDIUM | ✅ Fixed (shared store, 1 h) | `lib/cache/index.ts` |
| 2.4 | Xbox graph cache on serverless | MEDIUM | ✅ Resolved by removal (account finder, friend-graph crawl and graph cache deleted 2026-09-27) | `app/find`, `app/api/finder/*`, `lib/utils/xbox-graph-cache.ts` no longer exist |
| 3.1 | Max accounts | MEDIUM | ✅ Fixed | `app/api/profile/route.ts`, `lib/validators.ts` |
| 3.2 | Input format validation | MEDIUM | ✅ Fixed (all remaining routes: profile, achievements, image) | `lib/validators.ts` |
| 3.3 | Max length | LOW | ✅ Fixed | same |
| 4.1 | Image proxy size cap / type / redirects | MEDIUM | ✅ Fixed | `app/api/image/route.ts` |
| 4.2 | Image proxy timeout | LOW | ✅ Fixed | `app/api/image/route.ts` |
| 5.1 | Security headers / CSP | MEDIUM | ✅ Fixed (`unsafe-eval` dev-only) | `next.config.ts` |

Production note: without `UPSTASH_REDIS_REST_URL`/`TOKEN` (or `KV_REST_API_URL`/`TOKEN`) the store falls back to memory, so limits are per serverless instance. Configure Upstash (DEPLOY.md §5) before going public.

---

## Executive Summary

This audit was conducted prior to public production deployment. The application handles third-party gaming API keys and user data, requiring careful security controls. This report identifies vulnerabilities, assigns severity levels, and provides actionable fixes.

**Overall Risk Level**: MEDIUM  
**Critical Issues**: 0  
**High Issues**: 3  
**Medium Issues**: 5  
**Low Issues**: 4  
**Info**: 3

---

## 1. Secrets Management

### 1.1 API Keys in Environment Variables ✅ PASS
**Severity**: INFO  
**Original status (stale, pre-fix)**: ✅ SECURE

**Finding**: All API keys (OPENXBL_API_KEY, STEAM_API_KEY, PSN_NPSSO, IGDB_CLIENT_ID, IGDB_CLIENT_SECRET) are correctly stored as server-side environment variables.

**Verification**:
- ✅ No `NEXT_PUBLIC_*` variables present
- ✅ Secrets only accessed in `lib/adapters/index.ts` (server-side)
- ✅ `.env*` is in `.gitignore`
- ✅ `.env.example` contains placeholders only
- ✅ No secrets in API responses or error messages

**Files Checked**:
- `lib/adapters/index.ts:12,20,28` - Server-side only access
- `.gitignore:34` - Properly excludes `.env*`
- `.env.example` - Contains placeholders only

**Recommendation**: Maintain current implementation. Ensure deployment documentation emphasizes marking env vars as "sensitive" in Vercel.

---

### 1.2 PSN_NPSSO Personal Account Risk ⚠️ HIGH

**Verified status (2026-09-27, checked against code)**: ✅ MITIGATED (docs + server-only). `PSN_NPSSO` is read only in server code (`lib/adapters/index.ts`, `lib/adapters/psn-adapter.ts`, `app/api/profile/route.ts`); the client-bundle scan finds no value or name. DEPLOY.md §2.3/§4.3/§8.3 require a throwaway PSN account and describe rotation. Residual risk: it is still a personal session token by nature (cannot be fixed in code).
**Severity**: HIGH  
**Original status (stale, pre-fix)**: ⚠️ DOCUMENTATION REQUIRED

**Finding**: PSN_NPSSO is a personal Sony session token that grants full account access. Using a personal account in production poses significant risk:
- Token theft = account compromise
- Unofficial API against Sony ToS
- Risk of account ban
- Token expires every ~2 months

**Files**:
- `.env.example:30` - PSN_NPSSO token
- `lib/adapters/psn-adapter.ts` - Uses `psn-api` unofficial library

**Recommendation**:
1. **REQUIRED**: Create a dedicated throwaway PSN account for production
2. Document token rotation procedure (every 2 months)
3. Add clear warning in deployment docs about ToS violation risk
4. Consider making PSN optional feature behind flag
5. Implement token expiry detection with helpful error message

**Deployment Impact**: Owner must create new PSN account before production launch.

---

### 1.3 Secrets in Git History ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ⚠️ PARTIAL. The PC project is not a git repo, so there is no history to scan here. `.gitignore` has `.env*` with `!.env.example`, and `.env.example` holds placeholders only. Run `gitleaks detect` on the real repo before pushing.
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ SCAN REQUIRED

**Finding**: Git history has not been scanned for accidentally committed secrets.

**Recommendation**:
```bash
# Scan with gitleaks
docker run -v $(pwd):/path ghcr.io/gitleaks/gitleaks:latest detect --source="/path" -v

# Or use git-secrets
git secrets --scan-history
```

**Action**: Owner must run secret scan before first public push to GitHub.

---

### 1.4 Built Output Secret Leakage ⚠️ HIGH

**Verified status (2026-09-27, checked against code)**: ✅ VERIFIED. After `npm run build`, `gh-secret-scan.mjs` compared the 4 configured key values (OPENXBL, STEAM, FORTNITE, PSN_NPSSO) and their variable names against every file in `.next/static`: 29 files scanned, **0 key values and 0 variable names found** (2026-09-27, after the final build; IGDB_CLIENT_SECRET is empty locally, so it was not a meaningful comparison). `npm audit --omit=dev` and the full `npm audit` both report 0 vulnerabilities.
**Severity**: HIGH  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES VERIFICATION

**Finding**: Built `.next/static` bundles have not been verified to ensure no secrets leaked into client bundles.

**Files to Check**:
- `.next/static/**/*.js` - Client JavaScript bundles
- `.next/server/**/*.js` - Server bundles (should be safe but verify)

**Recommendation**:
```bash
# After build, grep for secret names and patterns
grep -r "OPENXBL_API_KEY\|STEAM_API_KEY\|PSN_NPSSO" .next/static/ 
grep -r "sk_\|pk_\|api_key\|apikey" .next/static/
```

**Action Required**: Add automated check to build pipeline.

---

## 2. Abuse & Cost Protection

### 2.1 Missing Rate Limiting ⚠️ HIGH

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. Every `/api` route calls `enforceRateLimit()` (`lib/rate-limit.ts`), keyed on `x-real-ip`/`x-forwarded-for`: profile 30/h, achievements 120/h, image 600/10 min, returning 429 + `Retry-After`. Counters live in the shared store (`lib/store/index.ts`, Upstash on Vercel). Tests: `test/rate-limit.test.ts`, `test/route-guards.test.ts`.
**Severity**: HIGH  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: No per-IP rate limiting on API routes. OpenXBL free tier is 150 requests/hour. Public traffic can exhaust quota in minutes.

**Affected Routes**:
- `app/api/profile/route.ts` - Main profile fetching
- `app/api/achievements/route.ts` - Achievement details
- `app/api/finder/search/route.ts` - Friend search
- `app/api/finder/smart-search/route.ts` - Xbox graph search
- `app/api/finder/dig/route.ts` - Friend crawl
- `app/api/finder/friends/route.ts` - Friend list
- `app/api/image/route.ts` - Image proxy

**Current Limitations**:
- OpenXBL: 150 requests/hour
- Steam: ~100,000 requests/day (generous but not unlimited)
- PSN: No official rate limit (unofficial API)

**Recommendation**: Implement multi-tier rate limiting:
1. **Per-IP rate limit**: 20 requests/hour per IP
2. **Global budget guard**: Track quota usage, return 429 when near limit
3. **Request deduplication**: In-flight request tracking
4. **Response caching**: 6-hour cache for profile/game data

**Implementation**: Use Vercel KV (Upstash Redis) or in-memory Map fallback.

**Original status (stale, pre-fix)**: NOT YET IMPLEMENTED - See Section 2.5 for implementation.

---

### 2.2 No Request Deduplication ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. `dedupe()` in `lib/rate-limit.ts` shares one in-flight promise between identical concurrent lookups; it is used by `app/api/profile/route.ts` (Xbox/Steam/PSN loaders) and `app/api/achievements/route.ts`. Across instances, the shared 1 h cache covers repeats. Test: `test/rate-limit.test.ts` (dedupe).
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: Multiple simultaneous requests for the same data will each hit the API, wasting quota.

**Example Attack**:
```javascript
// User can open 50 tabs to /p?xbox=SomeGamer
// Each tab fetches independently = 50 API calls
```

**Recommendation**: Implement in-flight request tracking:
```typescript
const pendingRequests = new Map<string, Promise<Response>>();

async function fetchWithDedup(key: string, fetcher: () => Promise<Response>) {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!;
  }
  const promise = fetcher();
  pendingRequests.set(key, promise);
  promise.finally(() => pendingRequests.delete(key));
  return promise;
}
```

**Original status (stale, pre-fix)**: NOT YET IMPLEMENTED

---

### 2.3 Missing Response Caching ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. `lib/cache/index.ts` is now a store-backed cache (Upstash on Vercel, memory locally) with `PROFILE_CACHE_TTL_SECONDS = 3600`, used by the profile and achievements routes.
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES ENHANCEMENT

**Finding**: Current cache implementation uses in-memory Map, which doesn't work in serverless (cold starts lose cache).

**Current Implementation**:
- `lib/cache.ts` - In-memory Map cache
- Works locally but not in Vercel/serverless

**Issues**:
- Cache lost on every cold start
- No shared cache across invocations
- Wastes API quota

**Recommendation**:
1. Implement Upstash Redis (Vercel KV) as primary cache
2. Fall back to in-memory Map for local development
3. Cache TTL: 6 hours for profile/games, 24 hours for images
4. Cache key format: `${platform}:${operation}:${identifier}:v2`

**Original status (stale, pre-fix)**: NEEDS UPGRADE TO PERSISTENT CACHE

---

### 2.4 Xbox Graph Cache Not Serverless-Compatible ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ✅ RESOLVED BY REMOVAL. The account finder (`/find`, `/api/finder/{search,smart-search,dig,friends}`) and `lib/utils/xbox-graph-cache.ts` were deleted, so nothing caches a friend graph any more. `/find` returns 404.
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES REFACTOR

**Finding**: `.data/xbox-graph.json` file-based cache won't work in serverless (read-only filesystem).

**Files**:
- `lib/utils/xbox-graph-cache.ts` - File-based cache
- `.gitignore:43` - Excludes `.data/`

**Current Implementation**:
```typescript
// Writes to filesystem
fs.writeFileSync('.data/xbox-graph.json', JSON.stringify(cache));
```

**Recommendation**: Make storage pluggable:
```typescript
interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
}

// Use Vercel KV in production, filesystem in dev
const store = process.env.KV_REST_API_URL 
  ? new KVCacheStore() 
  : new FileCacheStore();
```

**Original status (stale, pre-fix)**: NEEDS REFACTOR FOR SERVERLESS

---

### 2.5 Rate Limiting Implementation ⚠️ HIGH

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. Global OpenXBL budget in `lib/rate-limit.ts`: `reserveOpenXblRequest()` runs before every OpenXBL call (`lib/adapters/xbox-adapter.ts`). It allows 130/h (150 minus a 20 reserve) and also refuses when OpenXBL's own `X-RateLimit-Remaining` is 20 or lower. Users then get the friendly BUSY_MESSAGE (per-account error on /p, 503 on /api/achievements). The account finder, which could spend many requests per search, was removed entirely.
**Severity**: HIGH  
**Original status (stale, pre-fix)**: ⚠️ IMPLEMENTATION REQUIRED

**Action Items**:
1. Create `lib/rate-limit.ts` with per-IP tracking
2. Add middleware to all API routes
3. Implement global budget tracking
4. Add graceful degradation messages

**Example Implementation**:
```typescript
// lib/rate-limit.ts
import { NextRequest } from 'next/server';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: NextRequest, limit = 20, windowMs = 3600000) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { 
      allowed: false, 
      remaining: 0,
      resetAt: entry.resetAt 
    };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}
```

**Original status (stale, pre-fix)**: TO BE IMPLEMENTED

---

## 3. Input Validation

### 3.1 No Max Accounts Limit ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. `/api/profile` rejects more than 6 raw account inputs before parsing (`MAX_ACCOUNTS_PER_POOL`), (`lib/validators.ts`). The finder routes that took gamertag lists were removed.
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: Users can pool unlimited accounts, causing excessive API calls and slow responses.

**Files**:
- `app/api/profile/route.ts:30-32` - No limit check

**Current Behavior**:
```
/p?xbox=user1&xbox=user2&xbox=user3&...&xbox=user100
= 100 API calls, likely timeout
```

**Recommendation**: Enforce maximum of 6 accounts per pool:
```typescript
const MAX_ACCOUNTS = 6;
const totalAccounts = xboxGamertags.length + steamIds.length + psnIds.length;
if (totalAccounts > MAX_ACCOUNTS) {
  return NextResponse.json(
    { error: `Maximum ${MAX_ACCOUNTS} accounts allowed` },
    { status: 400 }
  );
}
```

**Original status (stale, pre-fix)**: NOT IMPLEMENTED

---

### 3.2 Insufficient Input Format Validation ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. `lib/validators.ts` validates Xbox/Steam/PSN IDs (profile), achievements params, and the image URL length (≤2048). Wired into all 3 remaining API routes (`/api/profile`, `/api/achievements`, `/api/image`). Test: `test/route-guards.test.ts`.
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: No validation of gamertag/ID formats. Allows injection attempts and invalid requests.

**Files**:
- `app/api/profile/route.ts` - No format validation
- `app/api/achievements/route.ts` - No format validation

**Recommendation**: Add format validators:
```typescript
function isValidGamertag(tag: string): boolean {
  return /^[a-zA-Z0-9\s]{1,15}$/.test(tag);
}

function isValidSteamId(id: string): boolean {
  return /^\d{17}$/.test(id);
}

function isValidPSNId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{3,16}$/.test(id);
}
```

**Original status (stale, pre-fix)**: NOT IMPLEMENTED

---

### 3.3 No Maximum Length Check ⚠️ LOW

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. Raw inputs are capped at 200 chars (profile) and 2048 (image URL, 414).
**Severity**: LOW  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: Query parameters have no maximum length, allowing potential DoS via extremely long strings.

**Recommendation**: Add length validation:
```typescript
const MAX_INPUT_LENGTH = 100;
if (gamertag.length > MAX_INPUT_LENGTH) {
  return NextResponse.json(
    { error: 'Input too long' },
    { status: 400 }
  );
}
```

**Original status (stale, pre-fix)**: NOT IMPLEMENTED

---

## 4. SSRF & Image Proxy Security

### 4.1 Image Proxy - Missing Size Cap ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. `app/api/image/route.ts` applies a 10 MB cap on both content-length and the streamed body (413), accepts raster `image/*` only (no SVG), sets nosniff, and follows redirects manually with an allowlist check on every hop. Tests: `test/image-route-avatars.test.ts`.
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: Image proxy has no size limit. Attacker could provide URL to massive file, causing memory exhaustion.

**Files**:
- `app/api/image/route.ts:55` - No size check before buffering

**Current Code**:
```typescript
const buffer = await response.arrayBuffer(); // No size limit!
```

**Recommendation**: Add size cap and streaming:
```typescript
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const contentLength = response.headers.get('content-length');

if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE) {
  return NextResponse.json(
    { error: 'Image too large' },
    { status: 413 }
  );
}

// Stream with size check
let bytesRead = 0;
const reader = response.body?.getReader();
const chunks: Uint8Array[] = [];

while (true) {
  const { done, value } = await reader!.read();
  if (done) break;
  
  bytesRead += value.length;
  if (bytesRead > MAX_IMAGE_SIZE) {
    return NextResponse.json(
      { error: 'Image too large' },
      { status: 413 }
    );
  }
  chunks.push(value);
}
```

**Original status (stale, pre-fix)**: NOT IMPLEMENTED

---

### 4.2 Image Proxy - Missing Timeout ⚠️ LOW

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. There is one 15 s AbortController covering redirects, the Steam cover fallback and the body (504 on timeout).
**Severity**: LOW  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: No timeout on fetch, allowing slow-loris style attacks.

**Files**:
- `app/api/image/route.ts:39` - Fetch without timeout

**Recommendation**: Add timeout:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

try {
  const response = await fetch(url.toString(), {
    signal: controller.signal
  });
  clearTimeout(timeoutId);
  // ... rest of code
} catch (err) {
  clearTimeout(timeoutId);
  if (err.name === 'AbortError') {
    return NextResponse.json(
      { error: 'Request timeout' },
      { status: 504 }
    );
  }
  throw err;
}
```

**Original status (stale, pre-fix)**: NOT IMPLEMENTED

---

### 4.3 Image Proxy - Host Allowlist ✅ PASS
**Severity**: INFO  
**Original status (stale, pre-fix)**: ✅ SECURE

**Finding**: Image proxy properly validates allowed hosts and checks redirects.

**Files**:
- `app/api/image/route.ts:4-8` - Allowlist definition
- `app/api/image/route.ts:35` - HTTPS + host validation
- `app/api/image/route.ts:42` - Redirect validation
- `app/api/image/route.ts:51` - Content-type validation

**Verified Controls**:
- ✅ HTTPS only
- ✅ Host allowlist (Steam CDN, Xbox images, MS Store)
- ✅ Redirect validation
- ✅ Content-type validation (image/* only)

**Recommendation**: Add PSN image hosts when PSN integration is active:
```typescript
const ALLOWED_HOSTS = [
  'cdn.cloudflare.steamstatic.com',
  'media.steampowered.com',
  'images-eds-ssl.xboxlive.com',
  'store-images.s-microsoft.com',
  'image.api.playstation.com', // PSN
];
```

---

## 5. Security Headers

### 5.1 Missing Security Headers ⚠️ MEDIUM

**Verified status (2026-09-27, checked against code)**: ✅ FIXED. `next.config.ts` sends CSP, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy. `'unsafe-eval'` is now sent in development only; the production `next start` response header is `script-src 'self' 'unsafe-inline'`, and the headless export run showed no CSP violations. `'unsafe-inline'` remains (Next.js inline bootstrap; a nonce-based CSP would be the next step).
**Severity**: MEDIUM  
**Original status (stale, pre-fix)**: ⚠️ REQUIRES IMPLEMENTATION

**Finding**: No security headers configured in `next.config.mjs`.

**Files**:
- `next.config.mjs` - No headers() function

**Recommendation**: Add comprehensive security headers:
```javascript
// next.config.mjs
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires eval
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
};
```

**Original status (stale, pre-fix)**: NOT IMPLEMENTED

---

## 6. File Upload Security

### 6.1 Profile Picture Upload - Basic Validation ✅ MOSTLY SECURE
**Severity**: LOW  
**Original status (stale, pre-fix)**: ⚠️ NEEDS IMPROVEMENT

**Finding**: Profile pictures are stored in localStorage (client-side only), with basic validation.

**Files**:
- `components/profile-picture-upload.tsx:20-47` - Client-side resize
- `components/profile-picture-upload.tsx:65` - File type check

**Current Controls**:
- ✅ Client-side only (no server upload)
- ✅ Type validation: `image/jpeg,image/png,image/webp`
- ✅ Resized to 256×256
- ✅ Converted to JPEG

**Risks**:
- No EXIF metadata stripping
- Could contain tracking pixels
- No SVG (good - SVG can contain scripts)

**Recommendation**: Add EXIF stripping:
```typescript
// After image load, draw to canvas (already done)
// Canvas drawing automatically strips EXIF data
// Current implementation is safe
```

**Original status (stale, pre-fix)**: ✅ SECURE (localStorage only, no server upload, canvas strips EXIF)

---

## 7. Dependency Security

### 7.1 npm audit Results
**Severity**: INFO  
**Original status (stale, pre-fix)**: TO BE VERIFIED

**Action**: Run `npm audit` and verify no high/critical vulnerabilities.

**Command**:
```bash
npm audit --production
```

**Recommendation**: Pin all dependencies and use `npm ci` in CI/CD.

**Original status (stale, pre-fix)**: TO BE RUN BEFORE DEPLOYMENT

---

### 7.2 Development Endpoints Exposed ⚠️ LOW

**Verified status (2026-09-27, checked against code)**: ✅ RESOLVED BY REMOVAL. The friend-graph finder was deleted (page, 4 API routes, graph cache, `finder` rate-limit bucket, tests); `/find` and `/api/finder/*` return 404.
**Severity**: LOW  
**Original status (stale, pre-fix)**: ⚠️ NEEDS REVIEW

**Finding**: `/find` endpoint enables friend-graph crawling. Could be abused to map Xbox social networks.

**Files**:
- `app/find/page.tsx` - Friend finder UI
- `app/api/finder/smart-search/route.ts` - Graph search with budget limit

**Current Controls**:
- ✅ Budget limit (20 requests per search)
- ✅ Rate limiting in smart-search

**Recommendation**: 
1. Add opt-in notice on `/find` page
2. Consider making it require a flag/auth
3. Current budget limit is reasonable

**Original status (stale, pre-fix)**: ACCEPTABLE WITH WARNINGS

---

## 8. Privacy & Compliance

### 8.1 Data Collection & Privacy ✅ MOSTLY COMPLIANT
**Severity**: INFO  
**Original status (stale, pre-fix)**: ⚠️ NEEDS PRIVACY PAGE

**Finding**: Application only fetches public gaming profiles, but no privacy policy exists.

**Data Collected**:
- Public gaming profiles (gamertags, avatars, game libraries)
- Uploaded profile pictures (localStorage only)
- IP addresses (for rate limiting only)

**Not Collected**:
- Personal information
- Cookies (beyond Next.js session)
- Analytics/tracking

**Recommendation**: Create `/privacy` page with:
- What data is fetched (public profiles only)
- No long-term storage of lookups
- IP addresses used only for rate limiting
- localStorage for profile pictures only
- Third-party API terms (Xbox, Steam, PSN)
- Contact information

**Original status (stale, pre-fix)**: PRIVACY PAGE REQUIRED

---

### 8.2 Logging & PII Exposure ⚠️ LOW
**Severity**: LOW  
**Original status (stale, pre-fix)**: ⚠️ NEEDS REVIEW

**Finding**: Console logs may expose IPs or identifiers in production.

**Files**:
- Multiple `console.error()` calls throughout API routes

**Current Logging**:
```typescript
console.error('[api/image] fetch failed for', url.hostname, err);
```

**Recommendation**: 
1. Use structured logging library (e.g., `pino`)
2. Scrub PII from logs
3. Log to Vercel logs (already happens)
4. Don't log full URLs or IPs

**Original status (stale, pre-fix)**: ACCEPTABLE BUT COULD BE IMPROVED

---

## 9. Built Output Verification

### 9.1 Client Bundle Secret Scan
**Original status (stale, pre-fix)**: ⚠️ TO BE PERFORMED

**Action Required**:
```bash
npm run build

# Scan static bundles for secrets
grep -r "OPENXBL_API_KEY\|STEAM_API_KEY\|PSN_NPSSO\|IGDB" .next/static/ || echo "✅ No secrets found"

# Scan for common secret patterns
grep -r "sk_\|pk_\|api_key\|apikey\|secret" .next/static/ | grep -v "apikey.png" || echo "✅ No patterns found"

# Check for environment variable references
grep -r "process\.env" .next/static/ || echo "✅ No process.env found"
```

**Original status (stale, pre-fix)**: TO BE RUN

---

## 10. Git History Secret Scan

### 10.1 Historical Secret Exposure
**Original status (stale, pre-fix)**: ⚠️ TO BE PERFORMED

**Action Required**:
```bash
# Install gitleaks (if not available via Docker)
# Via Homebrew: brew install gitleaks
# Via Docker: docker pull ghcr.io/gitleaks/gitleaks:latest

# Scan entire git history
gitleaks detect --source=. --verbose --report-path=gitleaks-report.json

# Or with Docker:
docker run -v $(pwd):/workspace ghcr.io/gitleaks/gitleaks:latest \
  detect --source="/workspace" --verbose --report-path=/workspace/gitleaks-report.json
```

**Original status (stale, pre-fix)**: TO BE RUN BEFORE FIRST PUBLIC PUSH

---

## Implementation Priority

### Immediate (Pre-Deployment)
1. ⚠️ **PSN_NPSSO**: Create throwaway PSN account
2. ⚠️ **Rate Limiting**: Implement per-IP limits on all API routes
3. ⚠️ **Input Validation**: Add max accounts limit and format validation
4. ⚠️ **Security Headers**: Add to next.config.mjs
5. ⚠️ **Secret Scans**: Run gitleaks and bundle scans

### High Priority (Week 1)
6. ⚠️ **Persistent Cache**: Implement Vercel KV (Upstash Redis)
7. ⚠️ **Image Proxy**: Add size cap and timeout
8. ⚠️ **Xbox Graph Cache**: Refactor for serverless
9. ⚠️ **Request Dedup**: Add in-flight tracking
10. ⚠️ **Privacy Page**: Create `/privacy` with policy

### Medium Priority (Week 2-3)
11. ⚠️ **Global Budget**: Track API quota usage
12. ⚠️ **Logging**: Improve structured logging
13. ⚠️ **npm audit**: Fix any vulnerabilities
14. ⚠️ **PSN Image Hosts**: Add to allowlist if needed

---

## Deployment Checklist

Before launching to production:

- [ ] Run `npm audit` - no high/critical vulnerabilities
- [ ] Run gitleaks scan - no secrets in history
- [ ] Run bundle secret scan - no secrets in `.next/static/`
- [ ] Create throwaway PSN account
- [ ] Implement rate limiting on all API routes
- [ ] Add max accounts limit (6)
- [ ] Add input format validation
- [ ] Configure security headers in next.config.mjs
- [ ] Set up Vercel KV for persistent cache
- [ ] Add size cap and timeout to image proxy
- [ ] Refactor xbox-graph-cache for serverless
- [ ] Create `/privacy` page
- [ ] Test rate limiting with multiple IPs
- [ ] Verify no secrets in `view-source:` in production
- [ ] Document PSN token rotation procedure
- [ ] Set up monitoring for API quota usage

---

## Conclusion

The application has a solid foundation but requires security hardening before production deployment. Most critical issues relate to rate limiting, quota management, and input validation—all addressable with the fixes outlined above.

**Recommendation**: Implement all HIGH and MEDIUM severity fixes before public launch. LOW severity issues can be addressed in the first post-launch update.

**Estimated Implementation Time**: 8-12 hours for all HIGH/MEDIUM fixes

---

*End of Security Audit Report*
