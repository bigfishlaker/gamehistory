import { NextRequest, NextResponse } from 'next/server';
import { normalizeEpicInput, validateEpicName } from '@/lib/fortnite';
import { enforceRateLimit } from '@/lib/rate-limit';
import { validateAccountPoolSize, validateGamertag, validateSteamId, validatePSNId, MAX_ACCOUNTS_PER_POOL } from '@/lib/validators';
import { normalizeXboxInput, normalizePSNInput } from '@/lib/input-normalizer';
import { normalizeSteamInput } from '@/lib/utils/steam-parser';
import { loadProfileData } from '@/lib/profile/load-profile';

/** Raw query values longer than this are rejected before any parsing (URLs included). */
const MAX_RAW_INPUT_LENGTH = 200;


export async function GET(request: NextRequest) {
  // Per-IP limit, shared across serverless instances (lib/rate-limit.ts).
  const limited = await enforceRateLimit(request, 'profile');
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  // Trim, drop empty values (e.g. "?xbox="), and de-duplicate repeated accounts
  // (gamertags case-insensitively) so the same account isn't fetched and counted twice.
  const uniq = (values: string[], fold: (v: string) => string) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
      const v = raw.trim();
      if (!v || seen.has(fold(v))) continue;
      seen.add(fold(v));
      out.push(v);
    }
    return out;
  };

  // Normalize inputs (handle URLs, various formats)
  const rawXboxInputs = searchParams.getAll('xbox');
  const rawSteamInputs = searchParams.getAll('steam');
  const rawPsnInputs = searchParams.getAll('psn');
  const rawEpicInputs = searchParams.getAll('epic');

  // Cheap guards before any parsing: pool size and raw length.
  const rawAll = [...rawXboxInputs, ...rawSteamInputs, ...rawPsnInputs, ...rawEpicInputs].filter(v => v.trim());
  if (rawAll.length > MAX_ACCOUNTS_PER_POOL) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ACCOUNTS_PER_POOL} accounts allowed per pool (you provided ${rawAll.length})` },
      { status: 400 }
    );
  }
  if (rawAll.some(v => v.length > MAX_RAW_INPUT_LENGTH)) {
    return NextResponse.json({ error: `Account input too long (max ${MAX_RAW_INPUT_LENGTH} characters)` }, { status: 400 });
  }

  const xboxGamertags: string[] = [];
  const psnIds: string[] = [];
  const normalizationErrors: string[] = [];

  // Normalize Xbox inputs
  for (const input of rawXboxInputs) {
    const result = normalizeXboxInput(input);
    if (result.success && result.identifier) {
      xboxGamertags.push(result.identifier);
    } else {
      normalizationErrors.push(`Xbox: ${result.error}`);
    }
  }

  // Normalize Steam input (profile/vanity links -> ID64 or vanity name) so a pasted
  // URL is never sent to the Steam API as an ID. Invalid input is kept as-is and
  // rejected by the adapter with a friendly message.
  const steamIds = uniq(
    rawSteamInputs.map(v => normalizeSteamInput(v)?.value ?? v),
    v => v
  );

  // Normalize PSN inputs
  for (const input of rawPsnInputs) {
    const result = normalizePSNInput(input);
    if (result.success && result.identifier) {
      psnIds.push(result.identifier);
    } else {
      normalizationErrors.push(`PSN: ${result.error}`);
    }
  }

  // Return normalization errors if any (Xbox/PSN only; Steam errors handled in adapter)
  if (normalizationErrors.length > 0) {
    return NextResponse.json(
      { error: normalizationErrors.join('; ') },
      { status: 400 }
    );
  }

  // Deduplicate after normalization
  const xboxGamertagsUniq = uniq(xboxGamertags, v => v.toLowerCase());
  const steamIdsUniq = steamIds; // Already deduped above
  const psnIdsUniq = uniq(psnIds, v => v.toLowerCase());
  const epicNamesUniq = uniq(rawEpicInputs.map(normalizeEpicInput), v => v.toLowerCase());

  // Validate account pool size
  const poolSizeValidation = validateAccountPoolSize(
    xboxGamertagsUniq.length,
    steamIdsUniq.length,
    psnIdsUniq.length,
    epicNamesUniq.length
  );
  if (!poolSizeValidation.valid) {
    return NextResponse.json(
      { error: poolSizeValidation.error },
      { status: 400 }
    );
  }

  // Validate Xbox gamertags
  for (const gamertag of xboxGamertagsUniq) {
    const validation = validateGamertag(gamertag);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid Xbox gamertag "${gamertag}": ${validation.error}` },
        { status: 400 }
      );
    }
  }

  // Validate Steam IDs
  for (const steamId of steamIdsUniq) {
    const validation = validateSteamId(steamId);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid Steam ID "${steamId}": ${validation.error}` },
        { status: 400 }
      );
    }
  }

  // Validate PSN IDs
  for (const psnId of psnIdsUniq) {
    const validation = validatePSNId(psnId);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid PSN ID "${psnId}": ${validation.error}` },
        { status: 400 }
      );
    }
  }

  // Validate Epic display names
  for (const name of epicNamesUniq) {
    const validation = validateEpicName(name);
    if (!validation.valid) {
      return NextResponse.json({ error: `Invalid Epic name "${name}": ${validation.error}` }, { status: 400 });
    }
  }

  // Epic/Fortnite lookups have their own, stricter per-IP limit on top of the profile limit.
  if (epicNamesUniq.length > 0) {
    const fortniteLimited = await enforceRateLimit(request, 'fortnite');
    if (fortniteLimited) return fortniteLimited;
  }

  // The global OpenXBL budget is enforced per upstream request in XboxAdapter.fetch
  // (lib/rate-limit.ts reserveOpenXblRequest); cached accounts cost nothing.

  if (xboxGamertagsUniq.length === 0 && steamIdsUniq.length === 0 && psnIdsUniq.length === 0 && epicNamesUniq.length === 0) {
    return NextResponse.json(
      { error: 'At least one account is required' },
      { status: 400 }
    );
  }

  const data = await loadProfileData({ xbox: xboxGamertagsUniq, steam: steamIdsUniq, psn: psnIdsUniq, epic: epicNamesUniq });
  return NextResponse.json(data);
}
