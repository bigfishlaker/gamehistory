import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FortniteCard } from '../components/fortnite-card';
import type { FortniteStats } from '../lib/fortnite';

const stats: FortniteStats = {
  accountId: '4735ce9132924caf8a5b17789b40f79c',
  name: 'Ninja',
  overall: { matches: 33204, wins: 11456, winRate: 34.5, kills: 221111, deaths: 21748, kd: 10.17, minutesPlayed: 215425 },
  modes: {
    solo: { matches: 13000, wins: 4000, winRate: 30.8, kills: 90000, deaths: 9000, kd: 10, minutesPlayed: 80000 },
    squad: { matches: 11204, wins: 4456, winRate: 39.8, kills: 71111, deaths: 6748, kd: 10.54, minutesPlayed: 75425 },
  },
  lastModified: '2026-07-24T19:51:10Z',
};

describe('FortniteCard', () => {
  it('shows hours, matches, wins, win %, kills, K/D, the modes present and the update date', () => {
    const html = renderToStaticMarkup(<FortniteCard stats={stats} />);
    for (const text of ['3,590.4h', '33,204', '11,456', '34.5%', '221,111', '10.17', 'Solo', 'Squad', 'Jul 24, 2026', 'fortnite-api.com']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('Duo');
    expect(html).not.toContain('Trio');
  });
});
