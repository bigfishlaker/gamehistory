/**
 * Robust DOM -> image export shared by every "Save as PNG" button.
 *
 * - Every <img> is fetched through /api/image (same origin, so no CORS taint),
 *   fully decoded and downscaled to the size it is actually drawn at before the
 *   snapshot, so html-to-image never has to fetch anything and no tile is blank.
 * - The output canvas is clamped to a pixel budget (browsers fail silently on
 *   huge canvases) and the file to 5 MB (lossless PNG if it fits, else a
 *   high-quality JPEG at full resolution, which stays sharper than a downscaled PNG).
 */
import { toCanvas } from 'html-to-image';

export const MAX_EXPORT_PIXELS = 16_000_000; // ~ 4000 x 4000
export const MAX_EXPORT_DIMENSION = 8192;
// Twitter/X rejects images over 5 MB, so that is the target (well under the 8 MB cap).
export const MAX_EXPORT_BYTES = 5 * 1024 * 1024;

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  type: 'image/png' | 'image/jpeg';
  pixelRatio: number;
  totalImages: number;
  failedImages: number;
  bytes: number;
}

/** Largest pixel ratio <= preferred that keeps the canvas inside the budget. */
export function computeExportPixelRatio(
  cssWidth: number,
  cssHeight: number,
  preferred: number,
  maxPixels = MAX_EXPORT_PIXELS,
  maxDimension = MAX_EXPORT_DIMENSION
): number {
  if (cssWidth <= 0 || cssHeight <= 0) return preferred;
  const byArea = Math.sqrt(maxPixels / (cssWidth * cssHeight));
  const byDim = maxDimension / Math.max(cssWidth, cssHeight);
  const r = Math.min(preferred, byArea, byDim);
  return Math.max(0.25, Math.floor(r * 100) / 100);
}

/** Route any non-data, non-same-origin image through the allowlisted proxy. */
export function toProxiedUrl(src: string, origin: string): string {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src;
  try {
    const u = new URL(src, origin);
    if (u.origin === origin) return u.pathname + u.search;
    return `/api/image?url=${encodeURIComponent(u.href)}`;
  } catch {
    return src;
  }
}

function placeholderDataUrl(w: number, h: number, label: string): string {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#27272a';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#d4d4d8';
  ctx.font = `bold ${Math.max(10, Math.round(c.width / 10))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = (label || 'Game').split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w0 of words) {
    const t = line ? `${line} ${w0}` : w0;
    if (ctx.measureText(t).width > c.width * 0.85 && line) {
      lines.push(line);
      line = w0;
    } else line = t;
  }
  if (line) lines.push(line);
  const lh = Math.max(12, Math.round(c.width / 8));
  lines.slice(0, 5).forEach((l, i, arr) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (arr.length - 1) / 2) * lh));
  return c.toDataURL('image/png');
}

async function loadBitmap(url: string, timeoutMs: number): Promise<ImageBitmap> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } finally {
    clearTimeout(t);
  }
}

async function setAndDecode(img: HTMLImageElement, src: string): Promise<void> {
  img.removeAttribute('srcset');
  // Lazy images (next/image defaults to loading="lazy") never decode while
  // off-screen, which hung the Top List export; force eager and cap the wait.
  img.loading = 'eager';
  img.src = src;
  try {
    await Promise.race([img.decode(), new Promise(r => setTimeout(r, 3000))]);
  } catch {
    /* data URLs we generated always decode; ignore */
  }
}

/**
 * Replace every <img> under root with a decoded, downscaled data URL.
 * Returns counts and a restore() that puts the original sources back.
 */
export async function inlineImages(
  root: HTMLElement,
  pixelRatio: number,
  opts: { concurrency?: number; timeoutMs?: number; retries?: number } = {}
): Promise<{ total: number; failed: number; restore: () => void }> {
  const { concurrency = 4, timeoutMs = 20000, retries = 2 } = opts;
  const imgs = Array.from(root.querySelectorAll('img'));
  const originals = imgs.map(img => ({ img, src: img.getAttribute('src') ?? '', srcset: img.getAttribute('srcset'), loading: img.getAttribute('loading') }));
  const origin = window.location.origin;
  let failed = 0;
  let next = 0;

  async function worker() {
    while (next < imgs.length) {
      const img = imgs[next++];
      const src = img.getAttribute('src') ?? '';
      const rect = img.getBoundingClientRect();
      const boxW = Math.max(1, rect.width || img.width || 100);
      const boxH = Math.max(1, rect.height || img.height || 150);
      if (src.startsWith('data:')) continue;
      let done = false;
      for (let attempt = 0; attempt <= retries && !done; attempt++) {
        try {
          const bmp = await loadBitmap(toProxiedUrl(src, origin), timeoutMs);
          // Draw at the displayed size x pixel ratio (never upscale): a 1080x1920
          // store cover shown in a 170px tile does not need to be kept full size.
          const targetW = Math.min(bmp.width, Math.ceil(boxW * pixelRatio));
          const scale = targetW / bmp.width;
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(bmp.width * scale));
          c.height = Math.max(1, Math.round(bmp.height * scale));
          const ctx = c.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bmp, 0, 0, c.width, c.height);
          bmp.close();
          await setAndDecode(img, c.toDataURL('image/jpeg', 0.9));
          done = true;
        } catch {
          /* back off, retry, then placeholder */
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      if (!done) {
        failed++;
        await setAndDecode(img, placeholderDataUrl(boxW * pixelRatio, boxH * pixelRatio, img.alt));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, imgs.length) }, worker));

  return {
    total: imgs.length,
    failed,
    restore: () => {
      for (const o of originals) {
        o.img.setAttribute('src', o.src);
        if (o.srcset) o.img.setAttribute('srcset', o.srcset);
        if (o.loading) o.img.setAttribute('loading', o.loading);
      }
    },
  };
}

function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas encode failed (too large?)'))), type, quality)
  );
}

function scaled(c: HTMLCanvasElement, f: number): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = Math.max(1, Math.round(c.width * f));
  o.height = Math.max(1, Math.round(c.height * f));
  const ctx = o.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, o.width, o.height);
  return o;
}

/**
 * Pick the encoding: lossless PNG if it fits maxBytes; otherwise JPEG at full
 * resolution (q 0.92 -> 0.85 -> 0.75); only then downscale.
 */
export async function encodeWithinBudget(
  canvas: HTMLCanvasElement,
  maxBytes = MAX_EXPORT_BYTES
): Promise<{ blob: Blob; canvas: HTMLCanvasElement; type: 'image/png' | 'image/jpeg' }> {
  const png = await canvasToBlob(canvas, 'image/png');
  if (png.size <= maxBytes) return { blob: png, canvas, type: 'image/png' };
  for (const q of [0.92, 0.85, 0.75]) {
    const jpg = await canvasToBlob(canvas, 'image/jpeg', q);
    if (jpg.size <= maxBytes) return { blob: jpg, canvas, type: 'image/jpeg' };
  }
  for (const f of [0.8, 0.6]) {
    const c = scaled(canvas, f);
    const jpg = await canvasToBlob(c, 'image/jpeg', 0.85);
    if (jpg.size <= maxBytes || f === 0.6) return { blob: jpg, canvas: c, type: 'image/jpeg' };
  }
  throw new Error('unreachable');
}

export async function exportNodeToImage(
  node: HTMLElement,
  opts: { preferredPixelRatio?: number; backgroundColor?: string; maxBytes?: number } = {}
): Promise<ExportResult> {
  const { preferredPixelRatio = 2, backgroundColor, maxBytes = MAX_EXPORT_BYTES } = opts;
  const cssW = node.scrollWidth || node.offsetWidth;
  const cssH = node.scrollHeight || node.offsetHeight;
  const pixelRatio = computeExportPixelRatio(cssW, cssH, preferredPixelRatio);

  const inlined = await inlineImages(node, pixelRatio);
  try {
    // Fonts are system fonts; skipping font embedding avoids CSS fetch errors.
    const canvas = await toCanvas(node, {
      pixelRatio,
      backgroundColor,
      cacheBust: false,
      skipFonts: true,
      width: cssW,
      height: cssH,
    });
    const enc = await encodeWithinBudget(canvas, maxBytes);
    const result: ExportResult = {
      blob: enc.blob,
      width: enc.canvas.width,
      height: enc.canvas.height,
      type: enc.type,
      pixelRatio,
      totalImages: inlined.total,
      failedImages: inlined.failed,
      bytes: enc.blob.size,
    };
    // Exposed for automated export checks (dimensions / size / blank tiles).
    const { blob: _blob, ...summary } = result;
    void _blob;
    (window as unknown as { __lastExport?: Omit<ExportResult, 'blob'> }).__lastExport = summary;
    return result;
  } finally {
    inlined.restore();
  }
}

export function downloadBlob(blob: Blob, baseName: string): string {
  const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
  const name = `${baseName}.${ext}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = name;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
