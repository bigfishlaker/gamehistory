#!/usr/bin/env node
/**
 * Builds the Grotto uploads (nothing is published):
 *   dist/gamer-id-forge-static.zip   self-contained game (index.html + app.js + app.css), calls the GAMER.ID API
 *   dist/gamer-id-forge-wrapper.zip  tiny index.html that frames GAME_URL (/mint?embed=grotto) and forwards the runtime
 * Env: GROTTO_API_BASE (default https://gamer-id.vercel.app), GROTTO_GAME_URL (default <API_BASE>/mint)
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(here, 'dist');
const API_BASE = (process.env.GROTTO_API_BASE || 'https://gamer-id.vercel.app').replace(/\/+$/, '');
const GAME_URL = process.env.GROTTO_GAME_URL || `${API_BASE}/mint`;
for (const u of [API_BASE, GAME_URL]) {
  const p = new URL(u);
  if (p.protocol !== 'https:' && p.hostname !== 'localhost' && p.hostname !== '127.0.0.1') throw new Error(`${u} must be https`);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, 'game'), { recursive: true });
mkdirSync(path.join(dist, 'wrapper'), { recursive: true });

await build({
  entryPoints: [path.join(here, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'chrome100', 'safari15'],
  jsx: 'automatic',
  outfile: path.join(dist, 'game/app.js'),
  alias: { '@': root },
  define: { __API_BASE__: JSON.stringify(API_BASE), 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'warning',
  logOverride: { 'unsupported-directive': 'silent' },
});
writeFileSync(path.join(dist, 'game/index.html'), readFileSync(path.join(here, 'src/index.html'), 'utf8').replaceAll('__API_BASE__', API_BASE));
writeFileSync(path.join(dist, 'wrapper/index.html'), readFileSync(path.join(here, 'wrapper/index.html'), 'utf8').replaceAll('__GAME_URL__', GAME_URL));

// Minimal zip writer (deflate), so the build needs no zip tool on Windows/macOS/Linux.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name);
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const out = {};
for (const [label, dir, names] of [
  ['static', 'game', ['index.html', 'app.js', 'app.css']],
  ['wrapper', 'wrapper', ['index.html']],
]) {
  const zipPath = path.join(dist, `gamer-id-forge-${label}.zip`);
  const buf = zip(names.map(n => [n, readFileSync(path.join(dist, dir, n))]));
  writeFileSync(zipPath, buf);
  out[label] = { zip: path.relative(root, zipPath), bytes: statSync(zipPath).size, sha256: createHash('sha256').update(buf).digest('hex') };
}
writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify({ apiBase: API_BASE, gameUrl: GAME_URL, builtAt: new Date().toISOString(), ...out }, null, 2));
console.log(JSON.stringify({ apiBase: API_BASE, gameUrl: GAME_URL, ...out }, null, 2));
