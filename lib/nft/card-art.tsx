import type { CardView } from './card-view';
import { sanitizeCover } from './top6';

export const CARD_WIDTH = 800;
export const CARD_HEIGHT = 1120;

const PLATFORM_LABEL = { xbox: 'XBOX', steam: 'STEAM', psn: 'PLAYSTATION', epic: 'EPIC' } as const;

/** Fetches a cover from an approved platform CDN and inlines it (satori can't be trusted to fetch). */
export async function inlineCover(url: string | undefined, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const safe = sanitizeCover(url);
  if (!safe) return null;
  try {
    const res = await fetchImpl(safe, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    const type = res.headers.get('content-type')?.split(';')[0].trim() ?? '';
    if (!res.ok || !['image/jpeg', 'image/png', 'image/gif'].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Satori/next-og markup for the card image. Flexbox only, inline styles. */
export function CardArt({ view, covers }: { view: CardView; covers: (string | null)[] }) {
  const [c1, c2, c3] = view.tier.colors;
  const slots = Array.from({ length: 6 }, (_, i) => view.top6[i]);
  return (
    <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', padding: 18, background: `linear-gradient(135deg, ${c1}, ${c2} 45%, ${c3})`, borderRadius: 48 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 34, padding: 40, color: '#f5f7ff', background: 'linear-gradient(160deg, #141826 0%, #0b0d16 55%, #1a1030 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 4 }}>GAMER.ID</div>
          <div style={{ display: 'flex', fontSize: 26, color: c2, fontWeight: 700 }}>{view.serial}</div>
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 30, color: '#aab3cc' }}>{view.displayName}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 6 }}>
          <div style={{ display: 'flex', fontSize: 120, fontWeight: 900, lineHeight: 1 }}>{view.totalHours.toLocaleString('en-US')}</div>
          <div style={{ display: 'flex', fontSize: 40, marginLeft: 14, marginBottom: 14, color: '#aab3cc' }}>hours</div>
        </div>
        <div style={{ display: 'flex', marginTop: 10, fontSize: 26, color: '#aab3cc' }}>
          {`${view.gameCount.toLocaleString('en-US')} games · ${view.platforms.map(p => PLATFORM_LABEL[p]).join(' · ') || '—'}`}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 34, justifyContent: 'space-between' }}>
          {slots.map((g, i) => (
            <div key={i} style={{ width: 222, height: 300, marginBottom: 18, display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden', background: '#1d2236', border: `2px solid ${i === 0 ? c2 : '#2b3150'}` }}>
              {covers[i] ? (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                <img src={covers[i]!} width={222} height={222} style={{ objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 222, height: 222, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: '#3a4166', fontWeight: 900 }}>{g ? g.t.slice(0, 1).toUpperCase() : '?'}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px' }}>
                <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g ? `${i + 1}. ${g.t}` : `${i + 1}. —`}</div>
                <div style={{ display: 'flex', fontSize: 18, color: '#8e97b3' }}>{g ? `${g.h.toLocaleString('en-US')}h` : ''}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', padding: '10px 22px', borderRadius: 999, fontSize: 26, fontWeight: 800, color: '#0b0d16', background: `linear-gradient(90deg, ${c1}, ${c2}, ${c3})` }}>{view.tier.name.toUpperCase()}</div>
          <div style={{ display: 'flex', fontSize: 20, color: '#6f7896' }}>SOULBOUND · TOP 6 LOCKED AT MINT</div>
        </div>
      </div>
    </div>
  );
}
