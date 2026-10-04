/** Card tier from total hours played. Dynamic: recomputed from GAMER.ID data for metadata. */
export interface Tier {
  id: 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legend';
  name: string;
  minHours: number;
  /** Frame gradient stops for the card art. */
  colors: [string, string, string];
}

export const TIERS: Tier[] = [
  { id: 'rookie', name: 'Rookie', minHours: 0, colors: ['#5b6475', '#9aa3b5', '#5b6475'] },
  { id: 'bronze', name: 'Bronze', minHours: 100, colors: ['#7a4a26', '#d39a62', '#7a4a26'] },
  { id: 'silver', name: 'Silver', minHours: 500, colors: ['#8e9aab', '#eef2f7', '#8e9aab'] },
  { id: 'gold', name: 'Gold', minHours: 1500, colors: ['#9c7313', '#ffe08a', '#9c7313'] },
  { id: 'platinum', name: 'Platinum', minHours: 3000, colors: ['#4fb3bf', '#e0fbff', '#4fb3bf'] },
  { id: 'diamond', name: 'Diamond', minHours: 6000, colors: ['#3a7bff', '#c9f1ff', '#9b5cff'] },
  { id: 'legend', name: 'Legend', minHours: 10000, colors: ['#ff3d6e', '#ffd36e', '#7c4dff'] },
];

export function tierForHours(hours: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (hours >= tier.minHours) t = tier;
  return t;
}

/** Next tier and how many hours are left (null at the top). */
export function nextTier(hours: number): { tier: Tier; hoursLeft: number } | null {
  const next = TIERS.find(t => t.minHours > hours);
  return next ? { tier: next, hoursLeft: Math.ceil(next.minHours - hours) } : null;
}
