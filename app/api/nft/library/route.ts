import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadProfileData } from '@/lib/profile/load-profile';
import { parseAccountInputs } from '@/lib/nft/inputs';
import { toLibrary } from '@/lib/nft/library';
import { devFixturesEnabled, fixtureProfile } from '@/lib/nft/dev-fixture';
import { json, preflight } from '@/lib/nft/route-helpers';

/**
 * GET /api/nft/library?xbox=..&steam=..&psn=..&epic=..
 * -> top games by hours for the Forge game (also used by the Grotto build, hence CORS).
 * Same upstream protections as /api/profile (per-IP limit + shared cache).
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'profile');
  if (limited) return limited;
  const sp = new URL(req.url).searchParams;
  const parsed = parseAccountInputs({ xbox: sp.getAll('xbox'), steam: sp.getAll('steam'), psn: sp.getAll('psn'), epic: sp.getAll('epic') });
  if (!parsed.ok) return json(req, { error: parsed.error }, { status: 400 });
  if (parsed.input.epic.length) {
    const l2 = await enforceRateLimit(req, 'fortnite');
    if (l2) return l2;
  }
  try {
    const data = devFixturesEnabled() ? fixtureProfile(parsed.input) : await loadProfileData(parsed.input);
    if (!data.profiles.length) {
      return json(req, { error: Object.values(data.errors)[0] ?? 'No accounts found' }, { status: 404 });
    }
    return json(req, toLibrary(data));
  } catch (err) {
    console.error('[nft:library]', err instanceof Error ? err.message : err);
    return json(req, { error: 'Could not load this library right now' }, { status: 503 });
  }
}

export const OPTIONS = preflight;
