/**
 * Error text shown to users must be a plain sentence, never a raw upstream body
 * (JSON such as {"code":"VALIDATION_ERROR",...}, HTML error pages, stack traces).
 */
export const GENERIC_UPSTREAM_ERROR = 'The platform API returned an error. Please try again shortly.';

export function userSafeError(message: string | undefined | null, fallback = GENERIC_UPSTREAM_ERROR): string {
  const text = (message ?? '').trim();
  if (!text) return fallback;
  // OpenXBL sometimes wraps a plain message in a JSON array of strings:
  // ["Request contains Accept-Language header with invalid locale value: *"]
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr) && arr.length > 0 && arr.every(v => typeof v === 'string')) {
        return userSafeError(arr.join(' '), fallback);
      }
    } catch { /* not JSON */ }
  }
  if (/^[\[{<]/.test(text)) return fallback; // JSON or HTML
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return fallback; // embedded HTML
  if (/"\s*:\s*/.test(text) && /[{}]/.test(text)) return fallback; // embedded JSON
  if (/\bat\s+\S+\s+\(.*:\d+:\d+\)/.test(text)) return fallback; // stack trace
  if (text.length > 240) return fallback;
  return text;
}
