import { XboxAdapter } from './xbox-adapter';
import { SteamAdapter } from './steam-adapter';
import { PSNAdapter } from './psn-adapter';
import { FortniteAdapter } from './fortnite-adapter';
import type { PlatformAdapter } from './platform-adapter';

export type { PlatformAdapter } from './platform-adapter';
export { XboxAdapter } from './xbox-adapter';
export { SteamAdapter } from './steam-adapter';
export { PSNAdapter } from './psn-adapter';
export { FortniteAdapter } from './fortnite-adapter';

export function createXboxAdapter(): XboxAdapter | null {
  const apiKey = process.env.OPENXBL_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new XboxAdapter(apiKey);
}

export function createSteamAdapter(): SteamAdapter | null {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new SteamAdapter(apiKey);
}

export function createPSNAdapter(): PSNAdapter | null {
  const npsso = process.env.PSN_NPSSO;
  if (!npsso) {
    return null;
  }
  return new PSNAdapter(npsso);
}

export function createFortniteAdapter(): FortniteAdapter | null {
  const apiKey = process.env.FORTNITE_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new FortniteAdapter(apiKey);
}

export function getAvailableAdapters(): PlatformAdapter[] {
  const adapters: PlatformAdapter[] = [];
  
  const xbox = createXboxAdapter();
  if (xbox) adapters.push(xbox);
  
  const steam = createSteamAdapter();
  if (steam) adapters.push(steam);
  
  const psn = createPSNAdapter();
  if (psn) adapters.push(psn);
  
  return adapters;
}
