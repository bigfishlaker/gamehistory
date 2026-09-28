/**
 * Minimal first-party visit counter (backup to Vercel Web Analytics), stored in Upstash.
 *
 * Per day (America/New_York), TTL 90 days:
 *   traffic:v1:<date>:views   page views (full page loads)
 *   traffic:v1:<date>:uv      unique visitors (HyperLogLog of a salted, daily-rotated
 *                             SHA-256 of IP + user agent; raw IPs are never stored)
 *   traffic:v1:<date>:paths   hash path -> views (known routes only; the rest is "/other")
 *   traffic:v1:<date>:refs    hash external referrer host -> views (first 50 hosts; then "other")
 *
 * Skipped: the owner (cookie gamerid_owner=1 or an IP in TRAFFIC_EXCLUDE_IPS), bots,
 * API/asset/prefetch requests, non-GET requests.
 */
import { Redis } from '@upstash/redis';
import { upstashConfigFromEnv } from './store';

export const TRAFFIC_TTL_SECONDS = 90 * 24 * 3600;
export const TRAFFIC_PREFIX = 'traffic:v1';

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|slack|headless|lighthouse|pagespeed|curl|wget|python|httpx|axios|node-fetch|go-http|java\/|okhttp|vercel|uptime|monitor/i;

export interface TrafficRequest {
  method: string;
  pathname: string;
  headers: { get(name: string): string | null };
  ownerCookie: boolean;
  ip: string;
  host: string;
}

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

export function excludedIps(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.TRAFFIC_EXCLUDE_IPS ?? '').split(',').map(s => s.trim()).filter(Boolean));
}

/** Only real page loads by humans who aren't the owner. */
export function shouldCount(req: TrafficRequest, env: NodeJS.ProcessEnv = process.env): boolean {
  if (req.method !== 'GET') return false;
  if (req.ownerCookie) return false;
  if (excludedIps(env).has(req.ip)) return false;
  const p = req.pathname;
  if (p.startsWith('/api/') || p.startsWith('/_next/') || p.startsWith('/_vercel/') || p === '/owner') return false;
  if (/\.[a-z0-9]{2,5}$/i.test(p)) return false; // files: favicon.ico, icon.png, robots.txt...
  const h = req.headers;
  if (h.get('rsc') || h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) return false;
  const dest = h.get('sec-fetch-dest');
  if (dest && dest !== 'document') return false;
  if (!dest && !(h.get('accept') ?? '').includes('text/html')) return false;
  if (isBot(h.get('user-agent'))) return false;
  return true;
}

/** Page routes tracked by name; anything else (404s, probes) is counted as "/other". */
export const KNOWN_TRAFFIC_PATHS = ['/', '/p', '/dashboard', '/help', '/privacy', '/gcr'] as const;
const KNOWN_PATH_SET = new Set<string>(KNOWN_TRAFFIC_PATHS);

/** Fixed set of hash fields, so random URLs can't grow the per-day paths hash. */
export function normalizeTrafficPath(pathname: string): string {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/';
  if (/^\/u\/[^/]+$/.test(p)) return '/u/:code';
  return KNOWN_PATH_SET.has(p) ? p : '/other';
}

/** Distinct referrer hosts kept per day; later new hosts are counted under "other". */
export const MAX_REFERRERS_PER_DAY = 50;

/**
 * HINCRBY the referrer, or "other" once the day's hash already holds MAX distinct
 * hosts and this one isn't among them. One round trip, atomic.
 * KEYS[1] = refs hash, ARGV = [host, cap, ttlSeconds]
 */
export const REFERRER_INCR_SCRIPT = `
local f = ARGV[1]
if redis.call('HEXISTS', KEYS[1], f) == 0 and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[2]) then f = 'other' end
redis.call('HINCRBY', KEYS[1], f, 1)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return f`;

export function referrerHost(referer: string | null, ownHost: string): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === ownHost.replace(/^www\./, '').toLowerCase() || (host.endsWith('.vercel.app') && host.startsWith('gamer-id'))) return null;
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

export function trafficDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export async function visitorHash(ip: string, userAgent: string, date: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${date}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis === undefined) {
    const cfg = upstashConfigFromEnv();
    redis = cfg ? new Redis({ url: cfg.url, token: cfg.token }) : null;
  }
  return redis;
}

/** Record one page view. Never throws (analytics must not break pages). */
export async function recordPageView(req: TrafficRequest, client?: Redis | null): Promise<boolean> {
  try {
    if (!shouldCount(req)) return false;
    const r = client === undefined ? getRedis() : client;
    if (!r) return false;
    const date = trafficDate();
    const salt = process.env.TRAFFIC_SALT || upstashConfigFromEnv()?.token || 'gamer-id';
    const uv = await visitorHash(req.ip, req.headers.get('user-agent') ?? '', date, salt);
    const k = `${TRAFFIC_PREFIX}:${date}`;
    const ref = referrerHost(req.headers.get('referer'), req.host);
    const p = r.pipeline();
    p.incr(`${k}:views`);
    p.expire(`${k}:views`, TRAFFIC_TTL_SECONDS);
    p.pfadd(`${k}:uv`, uv);
    p.expire(`${k}:uv`, TRAFFIC_TTL_SECONDS);
    p.hincrby(`${k}:paths`, normalizeTrafficPath(req.pathname), 1);
    p.expire(`${k}:paths`, TRAFFIC_TTL_SECONDS);
    if (ref) {
      p.eval(REFERRER_INCR_SCRIPT, [`${k}:refs`], [ref, String(MAX_REFERRERS_PER_DAY), String(TRAFFIC_TTL_SECONDS)]);
    }
    await p.exec();
    return true;
  } catch (err) {
    console.warn('[traffic] not recorded:', err instanceof Error ? err.message : err);
    return false;
  }
}
