# GAMER.ID build log: Sunday, September 27, 2026

GAMER.ID went from an empty GitHub repo to a polished, tested, deployed app in one day. All times are US Eastern (EDT). Times come from GitHub, Vercel's deployment API and file timestamps on the build machine. Where no exact time exists, the entry says "evening".

## Timeline

| Time (ET) | What happened |
|---|---|
| 1:57 PM | GitHub repo `bigfishlaker/gamehistory` created; first commit "Create README.md" at 1:59 PM |
| 2:01 PM | Local project folder created |
| 4:16 PM | First source snapshot archived (`gh-src.zip`) |
| 4:20–5:34 PM | Seven patch rounds (`gh-patch` … `gh-patch7`) on the Xbox / Steam / PSN adapters and the profile page |
| 4:46–4:47 PM | Project scaffold files (Next.js App Router, TypeScript, Tailwind v4) land in the folder (scaffolded by a Cursor cloud agent) |
| 5:32 PM | First audit script (`gh-audit.mjs`) |
| 6:33 PM | Backup before the Steam rework |
| 7:15–7:17 PM | Backup before the final hardening pass |
| 7:20–7:21 PM | Probes for the Upstash pool, raw PSN responses and the OpenXBL hourly budget |
| 7:23–7:35 PM | Fix rounds 3–5 |
| 7:38 PM | Secret-scan script written and run |
| 7:49–8:05 PM | Showcase image-export checks (saved PNG/JPEG exports compared); Xbox search probe |
| 8:08 PM | `SECURITY_AUDIT.md`, `DEPLOY.md` and the final report written |
| **8:17 PM** | **First production deploy to Vercel** (https://gamer-id.vercel.app) |
| 8:23–9:16 PM | 10 more deploys (one preview) while adding the example profile, the UI pass and persistent saved accounts (backups at 8:32, 8:36 and 8:52 PM) |
| Evening | Short share links (`/u/<code>`) and the rate-limit change (profile limit raised from 30 to 120 requests/hour per IP) |
| 9:30–9:59 PM | 3 more production deploys; backup before the polish pass at 9:51 PM |
| 10:03 PM onward | Polish pass (7 deploys): skeleton loaders, inline friendly errors, toasts, 44px tap targets, keyboard/ARIA fixes, custom 404, icons, per-page titles, library pagination, Vercel Web Analytics plus a privacy-friendly Redis traffic counter |
| Evening | README, build log, screenshots, secret scan, first full git commit |

## What got built

- Xbox (OpenXBL), Steam (Web API) and PlayStation (psn-api + NPSSO) adapters behind one interface
- Cross-platform title merging with an alias table, playtime and achievement aggregation
- Profile page (library, Top 6/10/25/50 showcase, top list), dashboard, help and privacy pages
- Image export tuned for X (≤ 5 MB), short share links (`/u/<code>`), share-to-X intents
- Upstash Redis: per-IP rate limits, a global OpenXBL budget (150/hour, 20 reserved), a 1-hour profile cache, short links, and a traffic counter that stores only hashed visitor IDs
- Security headers/CSP, an SSRF-safe image proxy, input validators, safe error messages
- Accessibility: 0 axe-core violations on 7 pages. Lighthouse 100 across the board on the home page; profile page performance went from 69 to 90 on mobile after paginating the library

## Problems hit along the way

- **OpenXBL free tier is 150 requests/hour for the whole site.** Fixed with a shared Redis budget, request dedupe, a 1-hour cache and a friendly "Xbox is busy" state that still shows the other platforms.
- **Sony rejects page sizes over 200** on the played-games endpoint, so PSN paging uses 200.
- **PSN avatars come back as `http://`** and were blocked by the CSP; they are upgraded to https.
- **Blank tiles in exported images** from cross-origin covers. All images now go through the same-origin proxy and are decoded before the snapshot.
- **Rate limit too tight for real use.** Raised from 30 to 120 profile requests/hour per IP.
- **Slow profile page on phones** (1.9 s total blocking time with hundreds of games). Rendering is now paged at 60 games.

## Final numbers

| Metric | Value |
|---|---|
| Tests | **333 passing** in 25 test files (Vitest) |
| Vercel deployments on the day | **20** (per the Vercel deployments API; all but one to production, all READY) |
| Lines of code | **10,715** lines of application TypeScript/TSX/CSS/MJS in 87 files, plus **3,976** lines of tests in 26 files (counted from git-tracked files, so node_modules and .next are excluded) |
| TypeScript | `tsc --noEmit` clean |
| Lint | 0 errors |
| axe-core | 0 violations (WCAG 2.2 AA + best practices) on 7 pages |
| Lighthouse (home, mobile) | Performance 100 · Accessibility 100 · Best Practices 100 · SEO 100 |

LOC command (PowerShell, from the repo root):

```powershell
$f = git ls-files | Where-Object { $_ -match '\.(ts|tsx|css|mjs)$' }
$f | Where-Object { $_ -notmatch '^(test|__tests__)/' } | ForEach-Object { (Get-Content -LiteralPath $_).Count } | Measure-Object -Sum
```

## Post-launch: Epic / Fortnite stats (2026-09-27, ~11 PM ET)

- **What:** "Epic / Fortnite" is a fourth account type (Epic display name, `?epic=` in URLs, localStorage and short links; still max 6 accounts in total). A Fortnite card shows lifetime Battle Royale hours (minutesPlayed/60), matches, wins, win %, kills, K/D, a solo/duo/squad breakdown (trios skipped, always empty) and the stats' last update.
- **Data model:** Fortnite is also a normal game entry, "Fortnite (Battle Royale stats)", with hours, so it counts in pooled totals and can be picked for the Top N showcase. Epic's stats already include matches played on Xbox/PlayStation, so when a pool also has console Fortnite the merged entry and the grand total use the larger side (never the sum).
- **Source:** fortnite-api.com `/v2/stats/br/v2?accountType=epic&timeWindow=lifetime`, key sent server-side in the `Authorization` header.
- **Observed upstream answers** (tested live): 200 stats (Ninja: 33,204 matches, 11,456 wins, 215,425 minutes); 403 `the requested account's stats are not public` (e.g. Clix, Ali-A); 404 `the requested account does not exist`; 404 `the requested profile didnt play any match yet`; 429 `the maximum allowed requests are 3 per 1s`. Headers report 180 requests/minute.
- **Guards:** name validation (3-16 chars, letters/digits/spaces/`. _ - ' ~ !`), per-IP limit of 60 Fortnite requests/hour on top of the profile limit, a global budget of 600 lookups/hour that fails closed when Redis is unavailable, and a 15-minute Redis cache (private/not-found answers are cached too, so repeats cost nothing).
- **Tests:** `test/fortnite.test.ts`, `test/fortnite-card.test.tsx` (parser, validator, adapter error mapping, budget/fail-closed, route + cache, per-IP limit, share links, persistence, overlap-free totals, card rendering).
