export function normalizeXboxImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  let normalized = url;

  if (normalized.startsWith('http://')) {
    normalized = normalized.replace('http://', 'https://');
  }

  // Title history returns many images on the non-SSL host "images-eds.xboxlive.com".
  // Over HTTPS that host serves an Akamai certificate that doesn't cover it
  // (ERR_TLS_CERT_ALTNAME_INVALID), so both next/image and /api/image fail with 500.
  // The same image path is served correctly by "images-eds-ssl.xboxlive.com".
  normalized = normalized.replace(/^https:\/\/images-eds\.xboxlive\.com\//i, 'https://images-eds-ssl.xboxlive.com/');

  if (normalized.includes('store-images.s-microsoft.com') && !normalized.includes('?w=')) {
    normalized += '?w=600';
  }

  return normalized;
}

/**
 * Legacy (Xbox 360-era) gamerpics come back as
 * images-eds-ssl.xboxlive.com/image?url=...&background=0xababab&mode=Padding&format=png
 * and the image service answers 400 Bad Request for mode=Padding without a size.
 * (Seen on a real account; the same URL with &w=208&h=208 returns 200 image/png.)
 */
export function normalizeXboxAvatarUrl(url: string | undefined): string | undefined {
  const normalized = normalizeXboxImageUrl(url);
  if (!normalized) return undefined;
  if (/[?&]mode=Padding/i.test(normalized) && !/[?&]w=\d+/i.test(normalized)) {
    return `${normalized}&w=208&h=208`;
  }
  return normalized;
}
