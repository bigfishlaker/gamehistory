# Deployment Guide
**GAMER.ID - Step-by-Step Deployment to Vercel**

This guide will walk you through deploying GAMER.ID to Vercel (recommended platform) with all required environment variables, caching, and security configurations.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Create GitHub Repository](#1-create-github-repository)
3. [Obtain API Keys](#2-obtain-api-keys)
4. [Deploy to Vercel](#3-deploy-to-vercel)
5. [Configure Environment Variables](#4-configure-environment-variables)
6. [Set Up Upstash KV (Redis Cache)](#5-set-up-upstash-kv-redis-cache)
7. [Custom Domain (Optional)](#6-custom-domain-optional)
8. [Post-Deployment Checklist](#7-post-deployment-checklist)
9. [Key Rotation](#8-key-rotation-if-leaked)
10. [Usage Monitoring](#9-usage-monitoring)
11. [What to Do If Site Goes Viral](#10-what-to-do-if-site-goes-viral)
12. [Share on Twitter (OG Meta Tags)](#11-share-on-twitter-og-meta-tags)

---

## Prerequisites

- GitHub account
- Vercel account (free tier is sufficient to start)
- API keys for Xbox, Steam, and optionally PlayStation
- Basic familiarity with git and command line

---

## 1. Create GitHub Repository

### Step 1.1: Create Private Repository

1. Go to https://github.com/new
2. **Repository name**: `gamehistory`
3. **Owner**: `bigfishlaker` (your username)
4. **Description**: "Gaming profile aggregator - GAMER.ID"
5. **Visibility**: ⚠️ **Private** (recommended - contains sensitive config)
6. **Do NOT** initialize with README, .gitignore, or license (we already have these)
7. Click "Create repository"

**[SCREENSHOT PLACEHOLDER: GitHub new repository page]**

### Step 1.2: Push Code to GitHub

```bash
# Navigate to your project directory
cd /path/to/gamehistory

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit - GAMER.ID"

# Add GitHub remote (replace with your actual repo URL)
git remote add origin https://github.com/bigfishlaker/gamehistory.git

# Push to GitHub
git branch -M main
git push -u origin main
```

⚠️ **SECURITY CHECK**: Before pushing, verify `.env` and `.env.local` are in `.gitignore`:

```bash
grep "\.env" .gitignore
# Should show: .env*
```

---

## 2. Obtain API Keys

You'll need API keys for each gaming platform you want to support.

### 2.1 OpenXBL API Key (Xbox) - REQUIRED

1. Visit https://xbl.io
2. Click "Sign In" and sign in with your Microsoft account
3. Go to your Dashboard: https://xbl.io/app/dashboard
4. Copy your API key from the dashboard
5. **Free Tier**: 150 requests/hour (sufficient for moderate traffic)

**[SCREENSHOT PLACEHOLDER: OpenXBL dashboard showing API key]**

⚠️ **Important**: The free tier resets hourly. If you expect high traffic, consider upgrading.

### 2.2 Steam Web API Key - REQUIRED

1. Visit https://steamcommunity.com/dev/apikey
2. Sign in with your Steam account
3. **Domain Name**: For development, use `localhost`. For production, use your domain (e.g., `gamehistory.example.com`)
4. Agree to the Steam Web API Terms of Use
5. Click "Register"
6. Copy your API key

**[SCREENSHOT PLACEHOLDER: Steam API key registration page]**

### 2.3 PSN NPSSO Token (PlayStation) - OPTIONAL

⚠️ **CRITICAL SECURITY WARNING**: 
- NPSSO is your personal PlayStation account session token
- **DO NOT use your main PSN account in production**
- Create a **throwaway PSN account** specifically for this application
- This unofficial API violates Sony's Terms of Service
- Risk of account ban if Sony detects automated access

**How to obtain NPSSO** (use throwaway account):

1. Create a new PSN account at https://www.playstation.com
2. Sign in to https://playstation.com in your browser
3. Open a new tab and visit: https://ca.account.sony.com/api/v1/ssocookie
4. You'll see JSON like: `{"npsso":"xxxxxx..."}`
5. Copy the 64-character `npsso` value (not including quotes)

**Token Expiry**: NPSSO tokens expire after ~2 months. You'll need to refresh it when PSN lookups start failing.

### 2.4 IGDB API Credentials - OPTIONAL

Used for enhanced game metadata and cover images (alternative to platform-specific images).

1. Create a Twitch Developer account at https://dev.twitch.tv
2. Register your application: https://dev.twitch.tv/console/apps
3. **Name**: "GAMER.ID"
4. **OAuth Redirect URLs**: `http://localhost:3000` (not used, but required)
5. **Category**: "Website Integration"
6. Click "Create"
7. Copy your **Client ID** and **Client Secret**

**[SCREENSHOT PLACEHOLDER: Twitch developer console]**

---

## 3. Deploy to Vercel

### Step 3.1: Import Project

1. Go to https://vercel.com
2. Click "Add New..." → "Project"
3. **Import Git Repository**:
   - Select "GitHub"
   - Authorize Vercel to access your GitHub account if prompted
   - Find and select `bigfishlaker/gamehistory`

**[SCREENSHOT PLACEHOLDER: Vercel import project screen]**

### Step 3.2: Configure Project

1. **Framework Preset**: Next.js (should auto-detect)
2. **Root Directory**: `./` (leave default)
3. **Build Command**: `npm run build` (should auto-fill)
4. **Output Directory**: `.next` (should auto-fill)
5. **Install Command**: `npm install` (should auto-fill)

### Step 3.3: Do NOT Deploy Yet

⚠️ **STOP**: Do not click "Deploy" yet! First, add environment variables.

---

## 4. Configure Environment Variables

### Step 4.1: Add Environment Variables in Vercel

1. In the Vercel import screen, expand **"Environment Variables"**
2. Add each variable below **one at a time**
3. ⚠️ For each variable:
   - Set **Environment**: `Production` (uncheck Preview and Development)
   - Check ✅ **"Sensitive"** (hides value in UI)

**[SCREENSHOT PLACEHOLDER: Vercel environment variables configuration]**

### Step 4.2: Required Variables

| Variable Name | Value | Where to Get It |
|--------------|-------|-----------------|
| `OPENXBL_API_KEY` | Your OpenXBL API key | See [2.1](#21-openxbl-api-key-xbox---required) |
| `STEAM_API_KEY` | Your Steam Web API key | See [2.2](#22-steam-web-api-key---required) |

### Step 4.3: Optional Variables

| Variable Name | Value | Where to Get It |
|--------------|-------|-----------------|
| `PSN_NPSSO` | Your PSN NPSSO token (throwaway account!) | See [2.3](#23-psn-npsso-token-playstation---optional) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST URL + token (or the `KV_REST_API_URL` / `KV_REST_API_TOKEN` pair) | Added by the Upstash Marketplace integration, see [5](#5-set-up-upstash-redis-shared-store-for-rate-limits-budget-and-cache). **Strongly recommended in production.** |
| `FORTNITE_API_KEY` | fortnite-api.com key (Fortnite stats) | fortnite-api.com dashboard |
| `IGDB_CLIENT_ID` | Your IGDB/Twitch Client ID | See [2.4](#24-igdb-api-credentials---optional) |
| `IGDB_CLIENT_SECRET` | Your IGDB/Twitch Client Secret | See [2.4](#24-igdb-api-credentials---optional) |
| `NEXT_PUBLIC_SITE_URL` | Public URL, used for absolute OG image links (defaults to `https://$VERCEL_URL`) | Your domain |

**Full env var list:** `OPENXBL_API_KEY` (required), `STEAM_API_KEY` (required), `PSN_NPSSO`,
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN`),
`FORTNITE_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `NEXT_PUBLIC_SITE_URL`.
None of them is exposed to the browser except `NEXT_PUBLIC_SITE_URL`.

### Step 4.4: Example Configuration

```plaintext
OPENXBL_API_KEY=1234567890abcdef1234567890abcdef
STEAM_API_KEY=ABCDEFGH123456789ABCDEFGH1234567
PSN_NPSSO=wxyz123...
```

⚠️ **Security Checklist**:
- [ ] All variables marked as "Sensitive"
- [ ] All variables set to "Production" only
- [ ] PSN_NPSSO is from throwaway account (if used)
- [ ] No quotes around values
- [ ] No spaces in variable names

### Step 4.5: Deploy

Now click **"Deploy"** and wait ~2-3 minutes for the build to complete.

---

## 5. Set Up Upstash Redis (shared store for rate limits, budget and cache)

On Vercel every request can land on a different serverless instance, so in-memory
state is **per instance** and resets on cold starts. GAMER.ID keeps the per-IP rate
limits, the global OpenXBL budget and the response cache
in a pluggable store (`lib/store/index.ts`):

- **Upstash Redis** (via `@upstash/redis`) when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  **or** `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set.
- **In-memory fallback** otherwise (fine for `npm run dev`; not shared between Vercel instances).

Without Upstash the app still works, but limits and the 150/hr Xbox budget are only
enforced per instance. **Set up Upstash before going public.**

### Step 5.1: Add Upstash from the Vercel Marketplace

1. Open your Vercel project → **Storage** tab (or **Integrations → Marketplace**).
2. Choose **Upstash → Upstash for Redis** → **Install / Create Database**.
3. **Name**: `gamer-id-store`; **Region**: the same region as your Vercel functions (e.g. `iad1` / US East).
4. Plan: the free tier is enough (the app does a few Redis commands per request).
5. **Connect** the database to the project for the **Production** (and optionally Preview) environment.

### Step 5.2: Check the injected variables

Vercel adds these automatically when the database is connected (names may vary by integration version):

- `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the Vercel-KV-compatible names), and/or
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN` / `KV_URL` / `REDIS_URL`: not used by the app

Either pair works; the app checks `UPSTASH_REDIS_REST_*` first, then `KV_REST_API_*`.
For local testing against the same database, copy the pair into `.env.local`
(`vercel env pull .env.local` does this).

### Step 5.3: Redeploy

Deployments → latest → **…** → **Redeploy** so the functions pick up the new variables.

**What is stored (all keys expire on their own):**

| Key prefix | Purpose | TTL |
|---|---|---|
| `rl:<route>:<ip>:<window>` | Per-IP limits: profile 30/h, achievements 120/h, image 600/10 min (`lib/rate-limit.ts`) | window length |
| `budget:openxbl:<hour>` / `budget:openxbl:upstream-remaining` | Global OpenXBL budget: 150/h with a 20-request reserve; past that users get a friendly "busy" message (HTTP 503) | 1 h |
| `cache:` | Profile/library responses (Xbox, Steam, PSN) and achievements | 1 h |
| `steamcover:` | Steam store header image for games without a legacy library cover | 7 days |

---

## 6. Custom Domain (Optional)

### Step 6.1: Add Domain in Vercel

1. Go to your project → "Settings" → "Domains"
2. Enter your domain (e.g., `gamehistory.example.com`)
3. Click "Add"

### Step 6.2: Configure DNS

Vercel will show DNS instructions. Common setups:

**Option A: CNAME (Subdomain)**
```
Type: CNAME
Name: gamehistory
Value: cname.vercel-dns.com
```

**Option B: A Record (Root Domain)**
```
Type: A
Name: @
Value: 76.76.21.21
```

**[SCREENSHOT PLACEHOLDER: Vercel domain configuration]**

### Step 6.3: Wait for DNS Propagation

- Can take 1-48 hours depending on your DNS provider
- Vercel will show "Valid Configuration" when ready
- SSL certificate is automatically provisioned

### Step 6.4: Update Steam API Key

⚠️ **Important**: Go back to https://steamcommunity.com/dev/apikey and update your registered domain from `localhost` to your production domain.

---

## 7. Post-Deployment Checklist

Run through this checklist after deploying:

### 7.1 Verify No Secrets in View-Source

1. Visit your deployed site (e.g., `https://gamehistory.vercel.app`)
2. Right-click → "View Page Source"
3. Press `Ctrl/Cmd+F` and search for:
   - `OPENXBL_API_KEY`
   - `STEAM_API_KEY`
   - `PSN_NPSSO`
   - `process.env`

✅ **Expected**: No matches found (secrets only on server-side)

**[SCREENSHOT PLACEHOLDER: View source showing no secrets]**

### 7.2 Test Main Pages

Visit and verify each page loads:

- [ ] Homepage: `/`
- [ ] Help page: `/help`
- [ ] Profile page: `/p?xbox=YourGamertag`
- [ ] Dashboard: `/dashboard?xbox=YourGamertag`
- [ ] Privacy policy: `/privacy`

### 7.3 Test Rate Limiting

Limits are per client IP (Vercel's `x-real-ip` / `x-forwarded-for`): `/api/profile` 30/h,
`/api/achievements` 120/h, `/api/image` 600 per 10 min.

```bash
for i in $(seq 1 31); do curl -s -o /dev/null -w "%{http_code}\n" "https://your-domain.com/api/profile?steam=76561197960435530"; done
```

✅ **Expected**: `200` for the first 30, then `429` with a `Retry-After` header and
`{"error":"Too many requests. Please wait a bit and try again."}`.
When the shared OpenXBL budget reaches its reserve, Xbox lookups return the friendly
"GAMER.ID is busy right now…" message instead of burning the last requests.

### 7.4 Test API Integrations

**Xbox**:
```
https://your-domain.com/p?xbox=MajorNelson
```
✅ Should show profile, games, and achievements

**Steam**:
```
https://your-domain.com/p?steam=76561197960435530
```
✅ Should show profile and games

**PSN** (if configured):
```
https://your-domain.com/p?psn=PlayStation
```
✅ Should show PSN profile

### 7.5 Verify Caching

1. Visit a profile page: `/p?xbox=SomeGamer`
2. Check Vercel logs (Project → "Logs" tab)
3. Look for cache hits (profiles are cached for 1 hour in Upstash under `cache:`)
4. Refresh the page immediately
5. Should see cache hit (faster load, no new API calls)

### 7.6 Check Security Headers

1. Visit https://securityheaders.com
2. Enter your deployed URL
3. Run scan

✅ **Expected Headers**:
- `Content-Security-Policy`: Present
- `X-Frame-Options`: DENY
- `X-Content-Type-Options`: nosniff
- `Strict-Transport-Security`: Present
- `Referrer-Policy`: Present

**[SCREENSHOT PLACEHOLDER: Security headers scan results]**

---

## 8. Key Rotation (If Leaked)

If any API key is compromised, rotate immediately:

### 8.1 Rotate OpenXBL Key

1. Visit https://xbl.io/app/dashboard
2. Click "Regenerate API Key"
3. Copy new key
4. Go to Vercel → Project → Settings → Environment Variables
5. Edit `OPENXBL_API_KEY`
6. Paste new value
7. Save
8. Redeploy: Deployments → Latest → "..." → Redeploy

### 8.2 Rotate Steam Key

1. Visit https://steamcommunity.com/dev/apikey
2. Click "Revoke My Steam Web API Key"
3. Re-register with same domain
4. Copy new key
5. Update in Vercel (same process as OpenXBL)
6. Redeploy

### 8.3 Rotate PSN NPSSO

1. Sign in to your throwaway PSN account
2. Visit https://ca.account.sony.com/api/v1/ssocookie
3. Copy new token
4. Update in Vercel
5. Redeploy

⚠️ **If main account was used**: Change PSN password immediately, sign out all devices, and consider the account compromised.

### 8.4 Verify Rotation

After redeployment:
1. Test affected platform's API calls
2. Check Vercel logs for "Unauthorized" or "Invalid API key" errors
3. If errors persist, verify new key was saved correctly

---

## 9. Usage Monitoring

### 9.1 Monitor API Quotas

**OpenXBL (150/hour)**:
1. Visit https://xbl.io/app/dashboard
2. Check "API Usage" section
3. Shows requests used in current hour

**[SCREENSHOT PLACEHOLDER: OpenXBL usage dashboard]**

**Vercel KV (Upstash)**:
1. Go to Vercel → Project → Storage → Your KV database
2. Click "View in Upstash Dashboard"
3. Monitor:
   - Total commands
   - Data stored
   - Daily requests

**[SCREENSHOT PLACEHOLDER: Upstash dashboard]**

### 9.2 Monitor Vercel Usage

1. Go to Vercel → Your Account → Usage
2. Check:
   - **Bandwidth**: Free tier = 100 GB/month
   - **Build Execution**: Free tier = 6,000 minutes/month
   - **Serverless Function Execution**: Free tier = 100 GB-hours/month
   - **Edge Requests**: Unlimited (with Fair Use)

### 9.3 Set Up Alerts (Optional)

**Vercel Notifications**:
1. Project → Settings → Notifications
2. Enable "Deployment Failed"
3. Enable "Quota Exceeded" (Pro plan only)

**Upstash Notifications**:
1. Upstash Dashboard → Database → Settings
2. Set alert thresholds for:
   - Daily request limit approaching
   - Storage limit approaching

---

## 10. What to Do If Site Goes Viral

If your site suddenly receives high traffic (e.g., viral Twitter post), take these steps:

### 10.1 Immediate Actions

1. **Monitor OpenXBL Quota**:
   - 150/hour is exhausted quickly with viral traffic
   - Upgrade to Pro plan: $10/month for 1,500/hour
   - Or pause Xbox features temporarily

2. **Enable Vercel's Edge Caching**:
   - Already configured with `Cache-Control` headers
   - Static pages cached at edge locations automatically

3. **Increase Rate Limits** (if needed):
   - Edit `lib/rate-limit.ts`
   - Change `limit` from `20` to `50` (or higher)
   - Redeploy

### 10.2 Cost Management

**Vercel Free Tier Limits**:
- Bandwidth: 100 GB/month
- If exceeded, upgrade to Pro ($20/month, 1 TB bandwidth)

**Upstash KV Free Tier**:
- 10,000 commands/day
- 256 MB storage
- If exceeded, automatically throttled (upgrade to $10/month for 10M commands)

### 10.3 Scaling Strategy

1. **Short-term** (hours to days):
   - Increase cache TTLs (6h → 24h for profiles)
   - Add query result pre-caching for popular gamertags
   - Consider read-only mode (disable new lookups temporarily)

2. **Medium-term** (days to weeks):
   - Upgrade OpenXBL plan
   - Upgrade Vercel to Pro
   - Add more aggressive caching layers

3. **Long-term** (weeks to months):
   - Implement user authentication to track usage
   - Add premium tier with higher rate limits
   - Self-host API fetching on separate server

---

## 11. Share on Twitter (OG Meta Tags)

Make your profile pages share beautifully on Twitter with Open Graph meta tags.

### 11.1 OG Tags Implementation

The following meta tags are automatically included for profile pages (`/p`):

```html
<meta property="og:title" content="{PlayerName}'s Gaming Profile - GAMER.ID" />
<meta property="og:description" content="View {PlayerName}'s gaming stats across Xbox, Steam, and PlayStation. {TotalHours} hours played, {GameCount} games, {AchievementCount} achievements unlocked." />
<meta property="og:image" content="https://your-domain.com/api/og?xbox={gamertag}&steam={id}" />
<meta property="og:url" content="https://your-domain.com/p?xbox={gamertag}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@yourusername" />
```

### 11.2 Create Dynamic OG Images (Optional Enhancement)

For even better Twitter cards, generate dynamic OG images:

1. Create `/app/api/og/route.tsx`:
   ```typescript
   import { ImageResponse } from 'next/og';
   
   export async function GET(request: Request) {
     const { searchParams } = new URL(request.url);
     const gamertag = searchParams.get('xbox') || 'Player';
     
     return new ImageResponse(
       (
         <div style={{ /* 1200x630 design */ }}>
           {/* Player avatar, stats, game covers */}
         </div>
       ),
       { width: 1200, height: 630 }
     );
   }
   ```

2. Reference in meta tags:
   ```html
   <meta property="og:image" content="https://your-domain.com/api/og?xbox={gamertag}" />
   ```

**[SCREENSHOT PLACEHOLDER: Example Twitter card]**

### 11.3 Test Twitter Card

1. Visit https://cards-dev.twitter.com/validator
2. Enter your profile URL: `https://your-domain.com/p?xbox=YourGamertag`
3. Click "Preview card"
4. Verify image and text display correctly

### 11.4 Share Template

When sharing on Twitter, use this template:

```
Just aggregated my gaming stats across Xbox, Steam, and PlayStation! 🎮

{TotalHours} hours played
{GameCount} games
{AchievementCount} achievements

Check out your own profile at: [your-domain.com]

#gaming #gamingcommunity #xbox #steam #playstation
```

---

## Deployment Complete! 🎉

Your GAMER.ID is now live and secure. Remember:

- ✅ Keep API keys secret (never commit to git)
- ✅ Monitor usage quotas (especially OpenXBL)
- ✅ Rotate PSN NPSSO token every 2 months
- ✅ Watch for security updates (run `npm audit` monthly)
- ✅ Check Vercel logs for errors or abuse

**Next Steps**:
1. Share on social media
2. Gather user feedback
3. Monitor traffic and costs
4. Consider premium features for power users

---

## Troubleshooting

### Issue: "Xbox API key not configured" error

**Solution**: Verify `OPENXBL_API_KEY` is set in Vercel Environment Variables (Production). Redeploy after adding.

### Issue: Rate limit too aggressive

**Solution**: Edit `lib/rate-limit.ts`, change limit from `20` to desired value, redeploy.

### Issue: PSN lookups failing with "Unauthorized"

**Solution**: NPSSO token expired (happens every ~2 months). Get fresh token, update in Vercel, redeploy.

### Issue: Steam games not loading

**Solution**: Verify Steam ID format (17 digits for SteamID64, or 3-32 character custom URL). Check `STEAM_API_KEY` is correct.

### Issue: Images not loading

**Solution**: 
1. Check browser console for CORS errors
2. Verify `/api/image` proxy is working
3. Check allowed hosts in `app/api/image/route.ts` include your image source

### Issue: "Maximum 6 accounts allowed" error

**Solution**: This is intentional to prevent API abuse. Users can only pool up to 6 accounts. Adjust `MAX_ACCOUNTS_PER_POOL` in `lib/validators.ts` if needed.

---

*End of Deployment Guide*
