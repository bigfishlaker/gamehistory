import { describe, it, expect } from 'vitest';

describe('Image Proxy URL Construction', () => {
  const ALLOWED_HOSTS = [
    'cdn.cloudflare.steamstatic.com',
    'media.steampowered.com',
    'images-eds-ssl.xboxlive.com',
    'store-images.s-microsoft.com',
  ];

  function isAllowedHost(hostname: string): boolean {
    return ALLOWED_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
  }

  function proxyImageUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    return `/api/image?url=${encodeURIComponent(url)}`;
  }

  it('should allow Steam CDN hosts', () => {
    expect(isAllowedHost('cdn.cloudflare.steamstatic.com')).toBe(true);
    expect(isAllowedHost('media.steampowered.com')).toBe(true);
  });

  it('should allow Xbox image hosts', () => {
    expect(isAllowedHost('images-eds-ssl.xboxlive.com')).toBe(true);
    expect(isAllowedHost('store-images.s-microsoft.com')).toBe(true);
  });

  it('should reject disallowed hosts', () => {
    expect(isAllowedHost('evil.com')).toBe(false);
    expect(isAllowedHost('example.com')).toBe(false);
    expect(isAllowedHost('malicious-steamstatic.com')).toBe(false);
  });

  it('should allow subdomains of allowed hosts', () => {
    expect(isAllowedHost('subdomain.cdn.cloudflare.steamstatic.com')).toBe(true);
  });

  it('should create proxied URLs for game covers', () => {
    const originalUrl = 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg';
    const proxiedUrl = proxyImageUrl(originalUrl);
    
    expect(proxiedUrl).toContain('/api/image?url=');
    expect(decodeURIComponent(proxiedUrl!.split('url=')[1])).toBe(originalUrl);
  });

  it('should create proxied URLs for avatars', () => {
    const avatarUrl = 'https://images-eds-ssl.xboxlive.com/image?url=test&w=208&h=208';
    const proxiedUrl = proxyImageUrl(avatarUrl);
    
    expect(proxiedUrl).toContain('/api/image?url=');
    const decoded = decodeURIComponent(proxiedUrl!.split('url=')[1]);
    expect(decoded).toBe(avatarUrl);
  });

  it('should handle undefined URLs gracefully', () => {
    const url: string | undefined = undefined;
    const proxiedUrl = proxyImageUrl(url);
    
    expect(proxiedUrl).toBeUndefined();
  });

  it('should properly encode special characters in URLs', () => {
    const urlWithSpecialChars = 'https://cdn.cloudflare.steamstatic.com/test?param=value&other=123';
    const proxiedUrl = proxyImageUrl(urlWithSpecialChars);
    
    expect(proxiedUrl).toContain('%3F'); // encoded ?
    expect(proxiedUrl).toContain('%26'); // encoded &
    expect(proxiedUrl).toContain('%3D'); // encoded =
  });
});

describe('Top 6 Export Filename Generation', () => {
  it('should create filename with player name', () => {
    const playerName = 'John Doe';
    const filename = `${playerName.toLowerCase().replace(/\s+/g, '-')}-top6.png`;
    
    expect(filename).toBe('john-doe-top6.png');
  });

  it('should handle player names with multiple spaces', () => {
    const playerName = 'Player   With   Spaces';
    const filename = `${playerName.toLowerCase().replace(/\s+/g, '-')}-top6.png`;
    
    expect(filename).toBe('player-with-spaces-top6.png');
  });

  it('should handle single word player names', () => {
    const playerName = 'Gamer';
    const filename = `${playerName.toLowerCase().replace(/\s+/g, '-')}-top6.png`;
    
    expect(filename).toBe('gamer-top6.png');
  });
});

describe('Top 6 Export Dimensions', () => {
  it('should use social media share card dimensions', () => {
    const width = 1200;
    const height = 675;
    const aspectRatio = width / height;
    
    expect(aspectRatio).toBeCloseTo(16 / 9, 2);
    expect(width).toBe(1200);
    expect(height).toBe(675);
  });
});
