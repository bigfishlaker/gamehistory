import { NextRequest, NextResponse } from 'next/server';
import { normalizeXboxImageUrl } from '@/lib/utils/xbox-images';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getStore } from '@/lib/store';
import { MAX_IMAGE_URL_LENGTH } from '@/lib/validators';

const ALLOWED_HOSTS = [
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  // Newer Steam store assets live under hashed paths on these hosts
  'shared.akamai.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'media.steampowered.com',
  'images-eds-ssl.xboxlive.com',
  'store-images.s-microsoft.com',
  'image.api.playstation.com',
  'psnobj.prod.dl.playstation.net',
  // Profile pictures (used by the Top 6 PNG export)
  'avatars.steamstatic.com',
  'avatars.akamai.steamstatic.com',
  'avatars.cloudflare.steamstatic.com',
  'static-resource.np.community.playstation.net',
  'psn-rsc.prod.dl.playstation.net',
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT = 15000; // 15 seconds, whole request incl. redirects, fallback and body
const MAX_REDIRECTS = 3;

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
}

class ProxyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Fetch with redirects followed by hand so every hop is checked against the
 * allowlist BEFORE it is requested (automatic redirects would already have
 * contacted an off-list host). One retry on a network error ("fetch failed"),
 * which image.api.playstation.com produces under parallel load.
 */
async function fetchAllowed(start: URL, signal: AbortSignal): Promise<Response> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetch(current.toString(), { signal, redirect: 'manual' });
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) throw err;
      await new Promise(r => setTimeout(r, 300));
      response = await fetch(current.toString(), { signal, redirect: 'manual' });
    }
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new ProxyError('Bad redirect', 502);
    }
    if (next.protocol !== 'https:' || !isAllowedHost(next.hostname)) {
      throw new ProxyError('Redirected to a host that is not allowed', 403);
    }
    if (hop === MAX_REDIRECTS) throw new ProxyError('Too many redirects', 502);
    current = next;
  }
  throw new ProxyError('Too many redirects', 502);
}

const STEAM_LIBRARY_RE = /^\/steam\/apps\/(\d{1,10})\/library_600x900(?:_2x)?\.jpg$/;

/**
 * Newer Steam apps have no library_600x900 image at the legacy path (404); their
 * art is under a hashed path only the store API knows. Look up header_image once
 * (cached 7 days) so the cover is never blank. The appid is digits only and the
 * store host is fixed, so this is not user-controlled fetching.
 */
async function steamFallbackUrl(url: URL, signal: AbortSignal): Promise<URL | null> {
  const m = url.hostname.endsWith('steamstatic.com') ? STEAM_LIBRARY_RE.exec(url.pathname) : null;
  if (!m) return null;
  const appId = m[1];
  const key = `steamcover:${appId}`;
  const store = getStore();
  let header = await store.get<string>(key).catch(() => null);
  if (header === null) {
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`, { signal });
      const j = r.ok ? await r.json() : null;
      header = (j?.[appId]?.data?.header_image as string | undefined) ?? '';
    } catch (err) {
      if (signal.aborted) throw err;
      header = '';
    }
    await store.set(key, header, header ? 7 * 86400 : 86400).catch(() => undefined);
  }
  if (!header) return null;
  try {
    const u = new URL(header);
    return u.protocol === 'https:' && isAllowedHost(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'image');
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  if (rawUrl.length > MAX_IMAGE_URL_LENGTH) {
    return NextResponse.json({ error: 'URL too long' }, { status: 414 });
  }

  // Older cached data can still contain images-eds.xboxlive.com URLs; map them to
  // the SSL host (the non-SSL host fails TLS validation over https).
  const imageUrl = normalizeXboxImageUrl(rawUrl) ?? rawUrl;

  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (url.protocol !== 'https:' || !isAllowedHost(url.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    let response = await fetchAllowed(url, controller.signal);
    if (response.status === 404) {
      const fallback = await steamFallbackUrl(url, controller.signal);
      if (fallback) response = await fetchAllowed(fallback, controller.signal);
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status >= 400 ? response.status : 502 });
    }

    // Raster images only. SVG can carry script, so it is not proxied.
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(jpeg|jpg|png|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/.test(contentType)) {
      return NextResponse.json({ error: 'Upstream did not return an image' }, { status: 502 });
    }

    // Check content-length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    // Stream and check size
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'No response body' }, { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.length;
      if (bytesRead > MAX_IMAGE_SIZE) {
        reader.cancel();
        return NextResponse.json({ error: 'Image too large' }, { status: 413 });
      }

      chunks.push(value);
    }

    // Combine chunks into single buffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof ProxyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    }
    console.error('[api/image] fetch failed for', url.hostname, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Image fetch failed' }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
