import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getStore } from '@/lib/store';
import {
  MAX_SHARE_BODY_BYTES,
  SHARE_TTL_SECONDS,
  canonicalShareKey,
  generateShareCode,
  isValidShareCode,
  shareKey,
  shareSetKey,
  validateShareInput,
  type ShareRecord,
} from '@/lib/share-links';

/**
 * POST /api/share  { xbox?: string[], steam?: string[], psn?: string[], off?: string[],
 *                    name?: string, size?: 6|10|25|50, top6?: string[], tab?: 'top6', example?: boolean }
 * -> { code, url }   Stores only public account identifiers under share:<code>.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'share');
  if (limited) return limited;

  const text = await request.text();
  if (text.length > MAX_SHARE_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = validateShareInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const record: ShareRecord = parsed.record;
  const origin = new URL(request.url).origin;
  const store = getStore();

  try {
    // Reuse the code for an identical set + view.
    const canonical = canonicalShareKey(record);
    const existing = await store.get<string>(shareSetKey(canonical));
    if (isValidShareCode(existing) && (await store.get(shareKey(existing)))) {
      return NextResponse.json({ code: existing, url: `${origin}/u/${existing}` });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShareCode();
      if (await store.get(shareKey(code))) continue; // collision (astronomically rare)
      await store.set(shareKey(code), record, SHARE_TTL_SECONDS);
      await store.set(shareSetKey(canonical), code, SHARE_TTL_SECONDS);
      return NextResponse.json({ code, url: `${origin}/u/${code}` }, { status: 201 });
    }
    return NextResponse.json({ error: 'Could not create a link, please try again' }, { status: 500 });
  } catch (err) {
    console.error('[share] store error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not create a link right now' }, { status: 503 });
  }
}
