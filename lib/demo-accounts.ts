/**
 * The example profile: one real, public, high-achieving Xbox account.
 * Stallion83 is widely known as the #1 Gamerscore holder.
 */

export interface DemoAccount {
  platform: 'xbox' | 'steam' | 'psn' | 'epic';
  identifier: string;
  displayName?: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    platform: 'xbox',
    identifier: 'Stallion83',
    displayName: 'Stallion83',
  },
];

const PLATFORM_LABELS: Record<DemoAccount['platform'], string> = {
  xbox: 'Xbox',
  steam: 'Steam',
  psn: 'PlayStation',
  epic: 'Epic',
};

/** e.g. "Example: Stallion83 (public Xbox profile)". */
export function getDemoLabel(): string {
  const names = DEMO_ACCOUNTS.map(a => a.displayName ?? a.identifier).join(', ');
  const platforms = Array.from(new Set(DEMO_ACCOUNTS.map(a => PLATFORM_LABELS[a.platform]))).join(' / ');
  const noun = DEMO_ACCOUNTS.length === 1 ? 'profile' : 'profiles';
  return `Example: ${names} (public ${platforms} ${noun})`;
}

/**
 * Generate the demo profile URL. `example=1` marks it as the example so it is never
 * saved as the visitor's own accounts.
 */
export function getDemoProfileUrl(): string {
  const params = new URLSearchParams();

  for (const account of DEMO_ACCOUNTS) {
    params.append(account.platform, account.identifier);
  }
  params.set('example', '1');

  return `/p?${params.toString()}`;
}

/**
 * Get summary statistics for the demo accounts.
 */
export function getDemoSummary() {
  const platforms = new Set(DEMO_ACCOUNTS.map(a => a.platform));
  const accountCount = DEMO_ACCOUNTS.length;

  return {
    accountCount,
    platformCount: platforms.size,
    platforms: Array.from(platforms),
  };
}
