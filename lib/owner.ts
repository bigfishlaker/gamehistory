/**
 * "Owner" opt-out: the site owner's own browsers are excluded from analytics.
 * Set once per browser/phone from the unlisted /owner page.
 */
export const OWNER_STORAGE_KEY = 'gamerid_owner';
export const OWNER_COOKIE = 'gamerid_owner';
export const OWNER_COOKIE_MAX_AGE = 5 * 365 * 24 * 3600; // 5 years

export function isOwnerBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(OWNER_STORAGE_KEY) === '1') return true;
  } catch { /* storage blocked */ }
  return document.cookie.split(';').some(c => c.trim() === `${OWNER_COOKIE}=1`);
}

export function setOwnerBrowser(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(OWNER_STORAGE_KEY, '1');
    else window.localStorage.removeItem(OWNER_STORAGE_KEY);
  } catch { /* storage blocked */ }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = on
    ? `${OWNER_COOKIE}=1; Max-Age=${OWNER_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
    : `${OWNER_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

/** Analytics never run for the owner, on localhost, or on private/dev hosts. */
export function shouldSkipAnalytics(hostname: string, owner: boolean): boolean {
  if (owner) return true;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local');
}
