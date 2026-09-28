/** X (Twitter) post intent: opens the composer with the text and link filled in. */
export function buildXIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/** Share text, e.g. "My gaming history: 6,541h across 1 platform. My Top 6 👇". */
export function buildShareText(hoursLabel: string, platformCount: number, size: number): string {
  return `My gaming history: ${hoursLabel} across ${platformCount} platform${platformCount === 1 ? '' : 's'}. My Top ${size} \u{1F447}`;
}
