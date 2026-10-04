import { normalizeEpicInput, validateEpicName } from '@/lib/fortnite';
import { normalizeXboxInput, normalizePSNInput } from '@/lib/input-normalizer';
import { normalizeSteamInput } from '@/lib/utils/steam-parser';
import { validateGamertag, validatePSNId, validateSteamId, MAX_ACCOUNTS_PER_POOL } from '@/lib/validators';
import type { ProfileInput } from '@/lib/profile/load-profile';

export type InputResult = { ok: true; input: ProfileInput } | { ok: false; error: string };

const MAX_RAW = 200;

/** Same normalization/validation rules as GET /api/profile, for JSON bodies of the card routes. */
export function parseAccountInputs(raw: unknown): InputResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'accounts is required' };
  const r = raw as Record<string, unknown>;
  const list = (k: string): string[] => {
    const v = r[k];
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) throw new Error(`accounts.${k} must be a list of strings`);
    return (v as string[]).map(s => s.trim()).filter(Boolean);
  };
  let xboxRaw: string[], steamRaw: string[], psnRaw: string[], epicRaw: string[];
  try {
    [xboxRaw, steamRaw, psnRaw, epicRaw] = [list('xbox'), list('steam'), list('psn'), list('epic')];
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const all = [...xboxRaw, ...steamRaw, ...psnRaw, ...epicRaw];
  if (all.length === 0) return { ok: false, error: 'At least one account is required' };
  if (all.length > MAX_ACCOUNTS_PER_POOL) return { ok: false, error: `Maximum ${MAX_ACCOUNTS_PER_POOL} accounts` };
  if (all.some(v => v.length > MAX_RAW)) return { ok: false, error: 'Account input too long' };

  const uniq = (vals: string[], fold = (s: string) => s.toLowerCase()) => {
    const seen = new Set<string>();
    return vals.filter(v => (seen.has(fold(v)) ? false : (seen.add(fold(v)), true)));
  };
  const xbox: string[] = [];
  for (const v of xboxRaw) {
    const n = normalizeXboxInput(v);
    if (!n.success || !n.identifier) return { ok: false, error: `Xbox: ${n.error}` };
    const val = validateGamertag(n.identifier);
    if (!val.valid) return { ok: false, error: `Invalid Xbox gamertag: ${val.error}` };
    xbox.push(n.identifier);
  }
  const psn: string[] = [];
  for (const v of psnRaw) {
    const n = normalizePSNInput(v);
    if (!n.success || !n.identifier) return { ok: false, error: `PSN: ${n.error}` };
    const val = validatePSNId(n.identifier);
    if (!val.valid) return { ok: false, error: `Invalid PSN ID: ${val.error}` };
    psn.push(n.identifier);
  }
  const steam: string[] = [];
  for (const v of steamRaw) {
    const id = normalizeSteamInput(v)?.value ?? v;
    const val = validateSteamId(id);
    if (!val.valid) return { ok: false, error: `Invalid Steam ID: ${val.error}` };
    steam.push(id);
  }
  const epic: string[] = [];
  for (const v of epicRaw) {
    const name = normalizeEpicInput(v);
    const val = validateEpicName(name);
    if (!val.valid) return { ok: false, error: `Invalid Epic name: ${val.error}` };
    epic.push(name);
  }
  return { ok: true, input: { xbox: uniq(xbox), steam: uniq(steam, s => s), psn: uniq(psn), epic: uniq(epic) } };
}
