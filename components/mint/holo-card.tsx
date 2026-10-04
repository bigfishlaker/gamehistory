'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { tierForHours } from '@/lib/nft/tier';

export interface HoloCardGame {
  title: string;
  cover?: string;
  hours: number;
}

export interface HoloCardProps {
  displayName: string;
  totalHours: number;
  gameCount: number;
  platforms: string[];
  games: (HoloCardGame | undefined)[];
  serial?: string;
  /** Disable pointer tilt (e.g. in screenshots or reduced motion). */
  still?: boolean;
}

const LABEL: Record<string, string> = { xbox: 'XBOX', steam: 'STEAM', psn: 'PLAYSTATION', epic: 'EPIC' };

/** Animated holographic card preview (CSS 3D tilt + foil that follows the pointer). */
export function HoloCard({ displayName, totalHours, gameCount, platforms, games, serial = '#??????', still }: HoloCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tier = tierForHours(totalHours);
  const [t1, t2, t3] = tier.colors;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (still || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--ry', `${(px - 0.5) * 22}deg`);
    ref.current.style.setProperty('--rx', `${(0.5 - py) * 22}deg`);
    ref.current.style.setProperty('--mx', `${px * 100}%`);
    ref.current.style.setProperty('--my', `${py * 100}%`);
  };
  const onLeave = () => {
    if (!ref.current) return;
    ref.current.style.setProperty('--rx', '0deg');
    ref.current.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="gf-card-stage">
      <div
        ref={ref}
        className="gf-card"
        style={{ '--t1': t1, '--t2': t2, '--t3': t3 } as CSSProperties}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        aria-label={`GAMER.ID card preview: ${totalHours} hours, ${tier.name} tier`}
      >
        <div className="gf-card-inner">
          <div className="gf-card-head">
            <span>GAMER.ID</span>
            <span className="gf-card-serial">{serial}</span>
          </div>
          <div className="gf-card-name">{displayName}</div>
          <div className="gf-card-hours">
            {totalHours.toLocaleString('en-US')}
            <span>hours</span>
          </div>
          <div className="gf-card-meta">
            {gameCount.toLocaleString('en-US')} games · {platforms.map(p => LABEL[p] ?? p).join(' · ')}
          </div>
          <div className="gf-card-grid">
            {Array.from({ length: 6 }, (_, i) => games[i]).map((g, i) => (
              <div key={i} className="gf-card-cell" title={g ? `${i + 1}. ${g.title} (${g.hours}h)` : `Slot ${i + 1}`}>
                {g?.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.cover} alt={g.title} />
                ) : (
                  <span>{g ? g.title.slice(0, 1).toUpperCase() : i + 1}</span>
                )}
              </div>
            ))}
          </div>
          <div className="gf-card-foot">
            <span className="gf-tier">{tier.name.toUpperCase()}</span>
            <small>SOULBOUND · TOP 6 LOCKED</small>
          </div>
        </div>
        <div className="gf-card-foil" />
      </div>
    </div>
  );
}
