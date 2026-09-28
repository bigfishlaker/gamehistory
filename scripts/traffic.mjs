#!/usr/bin/env node
/**
 * Prints the last 7 days of the first-party visit counter (lib/traffic.ts).
 *
 *   npx vercel@latest env pull .env.production.local --environment=production
 *   node scripts/traffic.mjs [envFile] [days]
 *
 * Reads KV_REST_API_URL/KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) from the
 * env file (default .env.production.local) or the environment. Read-only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { Redis } from '@upstash/redis';

const envFile = process.argv[2] || '.env.production.local';
const days = Math.max(1, Math.min(90, Number(process.argv[3]) || 7));

function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return out;
}

const env = { ...loadEnv(envFile), ...process.env };
const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error(`No Upstash credentials found (looked in ${envFile} and the environment).`);
  console.error('Run: npx vercel@latest env pull .env.production.local --environment=production');
  process.exit(1);
}
const redis = new Redis({ url, token });

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const dates = Array.from({ length: days }, (_, i) => fmt.format(new Date(Date.now() - i * 86_400_000)));

const p = redis.pipeline();
for (const d of dates) {
  const k = `traffic:v1:${d}`;
  p.get(`${k}:views`);
  p.pfcount(`${k}:uv`);
  p.hgetall(`${k}:paths`);
  p.hgetall(`${k}:refs`);
}
const res = await p.exec();

const paths = {};
const refs = {};
let totalViews = 0;
console.log(`GAMER.ID traffic, last ${days} days (America/New_York). Owner visits, bots and API calls excluded.\n`);
console.log('Date         Views  Uniques');
dates.forEach((d, i) => {
  const views = Number(res[i * 4] ?? 0);
  const uniques = Number(res[i * 4 + 1] ?? 0);
  totalViews += views;
  for (const [k, v] of Object.entries(res[i * 4 + 2] ?? {})) paths[k] = (paths[k] ?? 0) + Number(v);
  for (const [k, v] of Object.entries(res[i * 4 + 3] ?? {})) refs[k] = (refs[k] ?? 0) + Number(v);
  console.log(`${d}  ${String(views).padStart(5)}  ${String(uniques).padStart(7)}`);
});
console.log(`Total views: ${totalViews} (uniques are per day; the same person on two days counts twice)\n`);

const top = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
console.log('Top pages');
for (const [k, v] of top(paths)) console.log(`  ${String(v).padStart(5)}  ${k}`);
if (!Object.keys(paths).length) console.log('  (none yet)');
console.log('\nTop referrers');
for (const [k, v] of top(refs)) console.log(`  ${String(v).padStart(5)}  ${k}`);
if (!Object.keys(refs).length) console.log('  (none yet: direct visits or referrer not sent)');
