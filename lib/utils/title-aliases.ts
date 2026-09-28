/**
 * Title aliases and normalization rules for common game series.
 * Used by title-merger to correctly identify the same game across platforms and naming variations.
 */

export interface TitleAlias {
  normalized: string;
  aliases: string[];
  note?: string;
}

/**
 * Grand Theft Auto series aliases.
 */
export const GTA_ALIASES: TitleAlias[] = [
  {
    normalized: 'grand theft auto 5',
    aliases: ['Grand Theft Auto V', 'GTA V', 'GTA 5'],
  },
  {
    normalized: 'grand theft auto 4',
    aliases: ['Grand Theft Auto IV', 'GTA IV', 'GTA 4'],
  },
  {
    normalized: 'grand theft auto san andreas',
    aliases: ['Grand Theft Auto: San Andreas', 'GTA: San Andreas'],
  },
];

/**
 * Counter-Strike series aliases.
 */
export const CS_ALIASES: TitleAlias[] = [
  {
    normalized: 'counter strike global offensive',
    aliases: [
      'Counter-Strike: Global Offensive',
      'Counter-Strike: GO',
      'CS:GO',
    ],
  },
  {
    normalized: 'counter strike 2',
    aliases: ['Counter-Strike 2', 'CS2'],
  },
];

/**
 * Call of Duty series aliases.
 * Handles trademark symbols, abbreviations, back-compat names, and platform variations.
 */
export const COD_ALIASES: TitleAlias[] = [
  // Classic series (2003-2013)
  {
    normalized: 'call of duty',
    aliases: ['Call of Duty', 'COD', 'CoD'],
  },
  {
    normalized: 'call of duty 2',
    aliases: ['Call of Duty 2', 'COD 2', 'CoD 2'],
  },
  {
    normalized: 'call of duty 3',
    aliases: ['Call of Duty 3', 'COD 3', 'CoD 3'],
  },
  {
    normalized: 'call of duty 4 modern warfare',
    aliases: [
      'Call of Duty 4: Modern Warfare',
      'Modern Warfare®', // Short back-compat name
      'COD 4',
      'CoD 4',
      'COD: Modern Warfare',
      'Modern Warfare (2007)',
    ],
  },
  {
    normalized: 'call of duty world at war',
    aliases: [
      'Call of Duty: World at War',
      'Call of Duty®: WaW',
      'Call of Duty®: World at War',
      'COD: World at War',
      'COD: WaW',
      'WaW',
    ],
  },
  {
    normalized: 'call of duty modern warfare 2 2009',
    aliases: [
      'Call of Duty: Modern Warfare 2',
      'Modern Warfare® 2', // Xbox 360 back-compat name
      'COD: Modern Warfare 2',
      'MW2 (2009)',
    ],
  },
  {
    normalized: 'call of duty black ops',
    aliases: [
      'Call of Duty: Black Ops',
      'Call of Duty®: Black Ops',
      'COD: Black Ops',
      'Black Ops',
    ],
  },
  {
    normalized: 'call of duty modern warfare 3 2011',
    aliases: [
      'Call of Duty: Modern Warfare 3',
      'Modern Warfare® 3', // Xbox 360 back-compat name
      'COD: Modern Warfare 3',
      'MW3 (2011)',
    ],
  },
  {
    normalized: 'call of duty black ops 2',
    aliases: [
      'Call of Duty: Black Ops II',
      'Call of Duty®: Black Ops II',
      'COD: Black Ops II',
      'COD: Black Ops 2',
      'Black Ops II',
      'Black Ops 2',
    ],
  },
  {
    normalized: 'call of duty ghosts',
    aliases: [
      'Call of Duty: Ghosts',
      'Call of Duty®: Ghosts',
      'COD: Ghosts',
    ],
  },
  
  // Advanced Warfare era (2014-2016)
  {
    normalized: 'call of duty advanced warfare',
    aliases: [
      'Call of Duty: Advanced Warfare',
      'Call of Duty®: Advanced Warfare',
      'COD: Advanced Warfare',
      'Advanced Warfare',
    ],
  },
  {
    normalized: 'call of duty black ops 3',
    aliases: [
      'Call of Duty: Black Ops III',
      'Call of Duty®: Black Ops III',
      'Call of Duty: Black Ops 3',
      'COD: Black Ops III',
      'COD: Black Ops 3',
      'Black Ops III',
      'Black Ops 3',
    ],
  },
  {
    normalized: 'call of duty infinite warfare',
    aliases: [
      'Call of Duty: Infinite Warfare',
      'Call of Duty®: Infinite Warfare',
      'COD: Infinite Warfare',
      'Infinite Warfare',
    ],
  },
  
  // WWII and Modern era (2017-2020)
  {
    normalized: 'call of duty wwii',
    aliases: [
      'Call of Duty: WWII',
      'Call of Duty®: WWII',
      'COD: WWII',
      'COD WWII',
    ],
  },
  {
    normalized: 'call of duty black ops 4',
    aliases: [
      'Call of Duty: Black Ops 4',
      'Call of Duty®: Black Ops 4',
      'Call of Duty®: Black Ops IIII',
      'COD: Black Ops 4',
      'Black Ops 4',
    ],
  },
  {
    normalized: 'call of duty modern warfare 2019',
    aliases: [
      'Call of Duty®: Modern Warfare® (2019)', // Explicit year
      // The 2019 reboot's store/title-history name has no year or number. It must not
      // merge into COD4 (2007), whose 360 short name is "Modern Warfare®".
      'Call of Duty®: Modern Warfare®',
      'Call of Duty: Modern Warfare (2019)',
      'Modern Warfare (2019)',
      'MW (2019)',
    ],
  },
  {
    normalized: 'call of duty black ops cold war',
    aliases: [
      'Call of Duty®: Black Ops Cold War',
      'Call of Duty: Black Ops Cold War',
      'COD: Black Ops Cold War',
      'Black Ops Cold War',
    ],
  },
  
  // Modern Warfare II/III and Black Ops 6 (2022+)
  {
    normalized: 'call of duty modern warfare 2 2022',
    aliases: [
      'Call of Duty®: Modern Warfare® II',
      'Call of Duty: Modern Warfare II (2022)',
      'Modern Warfare II',
      'MW2 (2022)',
      'MWII',
    ],
  },
  {
    normalized: 'call of duty modern warfare 3 2023',
    aliases: [
      'Call of Duty®: Modern Warfare® III',
      'Call of Duty: Modern Warfare III (2023)',
      'Modern Warfare III',
      'MW3 (2023)',
      'MWIII',
    ],
  },
  {
    normalized: 'call of duty black ops 6',
    aliases: [
      'Call of Duty®: Black Ops 6',
      'Call of Duty: Black Ops 6',
      'COD: Black Ops 6',
      'Black Ops 6',
      'BO6',
    ],
  },
  
  // Special: COD HQ launcher (not a specific game)
  {
    normalized: 'call of duty hq launcher',
    aliases: [
      'Call of Duty®', // Steam appid 1938090
      'Call of Duty HQ',
      'Call of Duty HQ (MW2/MW3/BO6/Warzone)',
    ],
    note: 'Launcher for MW2 (2022), MW3 (2023), BO6, and Warzone',
  },
  
  // Warzone variants
  {
    normalized: 'call of duty warzone',
    aliases: [
      'Call of Duty®: Warzone™',
      'Call of Duty: Warzone',
      'COD: Warzone',
      'Warzone',
    ],
  },
];

/**
 * Find the canonical normalized form for a title using the alias table.
 */
/** Steam appid 1938090 is just "Call of Duty®": the HQ launcher that holds MW2/MW3/BO6/Warzone hours. */
export const COD_HQ_STEAM_APPID = '1938090';
export const COD_HQ_TITLE = 'Call of Duty HQ (MW2/MW3/BO6/Warzone)';

export function findTitleAlias(title: string): string | null {
  const cleaned = title
    .replace(/[®™©]/g, '')
    .trim();
  
  // Special case: bare "Call of Duty" on Steam is the HQ launcher (appid 1938090)
  // On other platforms, it's the 2003 original game
  if (cleaned === 'Call of Duty') {
    // For now, treat bare "Call of Duty" as HQ launcher
    // This matches Steam's appid 1938090
    return 'call of duty hq launcher';
  }
  
  // Check all alias tables: COD, GTA, Counter-Strike
  const allAliases = [...COD_ALIASES, ...GTA_ALIASES, ...CS_ALIASES];
  
  for (const entry of allAliases) {
    for (const alias of entry.aliases) {
      const cleanedAlias = alias.replace(/[®™©]/g, '');
      if (cleanedAlias.toLowerCase() === cleaned.toLowerCase()) {
        return entry.normalized;
      }
    }
  }
  
  return null;
}

/**
 * Get the note for a normalized title if one exists.
 */
export function getTitleNote(normalizedTitle: string): string | undefined {
  for (const entry of COD_ALIASES) {
    if (entry.normalized === normalizedTitle) {
      return entry.note;
    }
  }
  return undefined;
}
