import { describe, it, expect } from 'vitest';
import { buildXIntentUrl, buildShareText } from '../lib/share';

describe('Share on X', () => {
  it('builds the share text from real values', () => {
    expect(buildShareText('6,541h', 1, 6)).toBe('My gaming history: 6,541h across 1 platform. My Top 6 \u{1F447}');
    expect(buildShareText('1,234h', 3, 10)).toBe('My gaming history: 1,234h across 3 platforms. My Top 10 \u{1F447}');
  });

  it('builds an encoded x.com post intent with the profile link', () => {
    const url = buildXIntentUrl(
      buildShareText('6,541h', 1, 6),
      'https://gamer-id.vercel.app/p?xbox=Stallion83&tab=top6',
    );
    expect(url).toBe(
      'https://x.com/intent/post?text=My%20gaming%20history%3A%206%2C541h%20across%201%20platform.%20My%20Top%206%20%F0%9F%91%87&url=https%3A%2F%2Fgamer-id.vercel.app%2Fp%3Fxbox%3DStallion83%26tab%3Dtop6',
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('url')).toBe('https://gamer-id.vercel.app/p?xbox=Stallion83&tab=top6');
  });
});
