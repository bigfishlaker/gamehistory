import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/image/route';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const req = (u: string) => new NextRequest(`http://localhost/api/image?url=${encodeURIComponent(u)}`);

describe('/api/image allowlist covers profile pictures (Top 6 PNG export)', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it.each([
    'https://avatars.steamstatic.com/d9ae20073fec963f0eeb41013911fa1aefb6b6bd_full.jpg',
    'https://static-resource.np.community.playstation.net/avatar/default/abc.png',
    'https://images-eds-ssl.xboxlive.com/image?url=abc&format=png',
  ])('proxies %s', async (u) => {
    global.fetch = vi.fn().mockResolvedValue(new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
    const res = await GET(req(u));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/');
  });

  it('still rejects other hosts', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const res = await GET(req('https://evil.example.com/a.png'));
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('/api/image hardening', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('does not follow a redirect to a host off the allowlist', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://evil.example.com/x.png' } }));
    global.fetch = f as unknown as typeof fetch;
    const res = await GET(req('https://avatars.steamstatic.com/a.jpg'));
    expect(res.status).toBe(403);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a redirect that stays on the allowlist', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://avatars.akamai.steamstatic.com/a.jpg' } }))
      .mockResolvedValueOnce(new Response(png, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    global.fetch = f as unknown as typeof fetch;
    const res = await GET(req('https://avatars.steamstatic.com/a.jpg'));
    expect(res.status).toBe(200);
  });

  it('rejects SVG and non-image content types', async () => {
    for (const ct of ['image/svg+xml', 'text/html']) {
      global.fetch = vi.fn().mockResolvedValue(new Response('<svg/>', { status: 200, headers: { 'content-type': ct } })) as unknown as typeof fetch;
      const res = await GET(req('https://avatars.steamstatic.com/a.svg'));
      expect(res.status).toBe(502);
    }
  });

  it('rejects oversize images by content-length', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) } })) as unknown as typeof fetch;
    const res = await GET(req('https://avatars.steamstatic.com/a.png'));
    expect(res.status).toBe(413);
  });

  it('rejects very long URLs without fetching', async () => {
    const f = vi.fn();
    global.fetch = f as unknown as typeof fetch;
    const res = await GET(req('https://avatars.steamstatic.com/' + 'a'.repeat(2100)));
    expect(res.status).toBe(414);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('/api/image fallbacks', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('falls back to the Steam store header image when the legacy library cover 404s', async () => {
    const header = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3470360/abc/header.jpg?t=1';
    const f = vi.fn(async (u: string) => {
      if (u.includes('library_600x900')) return new Response('nf', { status: 404 });
      if (u.startsWith('https://store.steampowered.com/api/appdetails')) return new Response(JSON.stringify({ 3470360: { success: true, data: { header_image: header } } }), { status: 200 });
      if (u === header) return new Response(png, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      return new Response('x', { status: 500 });
    });
    global.fetch = f as unknown as typeof fetch;
    const res = await GET(req('https://cdn.cloudflare.steamstatic.com/steam/apps/3470360/library_600x900_2x.jpg'));
    expect(res.status).toBe(200);
    expect(f.mock.calls.map(c => String(c[0]))).toContain(header);
  });

  it('retries once after a network error', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
    global.fetch = f as unknown as typeof fetch;
    const res = await GET(req('https://image.api.playstation.com/vulcan/a.png'));
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
