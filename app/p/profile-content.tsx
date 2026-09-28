'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { ProfileCard } from '@/components/profile-card';
import { GameCard } from '@/components/game-card';
import { AchievementList } from '@/components/achievement-list';
import { Top6Picker } from '@/components/top6-picker';
import { Top6Showcase } from '@/components/top6-showcase';
import { Top6ExportCard } from '@/components/top6-export-card';
import { Top6ProfilePictureSelector } from '@/components/top6-profile-picture-selector';
import { Top6SubtitleEditor } from '@/components/top6-subtitle-editor';
import { TopList } from '@/components/top-list';
import { AddAccountPanel } from '@/components/add-account-panel';
import { ManualGameEntry } from '@/components/manual-game-entry';
import { ManualGameList } from '@/components/manual-game-list';
import { getManualGames, saveManualGame, deleteManualGame, manualGameToGame, type ManualGame } from '@/lib/manual-games';
import { mergeGames, sortGames, filterGames, type SortOption, type FilterOption } from '@/lib/utils/title-merger';
import { summarizePlaytime, formatHours } from '@/lib/utils/playtime';
import type { PlayerProfile, Game, Achievement, NormalizedGame, PlaytimeSummary, Platform } from '@/lib/types';
import { exportNodeToImage, downloadBlob } from '@/lib/export/export-image';
import { pickHeaderIdentity } from '@/lib/utils/header-identity';
import { SHOWCASE_SIZES, isShowcaseSize, fillSelection, showcaseLayout, formatShowcaseHours, type ShowcaseSize } from '@/lib/export/showcase-layout';
import { useRef } from 'react';
import { saveAccountSet, withDisplayNames, accountsFromParams } from '@/lib/saved-accounts';
import { SavedAccountsPanel } from '@/components/saved-accounts-panel';
import { getDemoLabel } from '@/lib/demo-accounts';
import { buildShareText, buildXIntentUrl } from '@/lib/share';
import { AccountErrors } from '@/components/account-errors';
import { ProfileSkeleton } from '@/components/skeletons';
import { FortniteCard } from '@/components/fortnite-card';
import type { FortniteStats } from '@/lib/fortnite';

const MAX_ACCOUNTS_PER_POOL = 6;

interface ProfileData {
  profiles: PlayerProfile[];
  games: Game[];
  playtime?: PlaytimeSummary;
  errors: Record<string, string>;
  /** Fortnite Battle Royale stats per Epic account id. */
  fortnite?: Record<string, FortniteStats>;
}

const platformNames: Record<Platform, string> = { xbox: 'Xbox', steam: 'Steam', psn: 'PlayStation', epic: 'Epic / Fortnite' };

// Large libraries (thousands of games) render in pages to keep the page responsive.
const LIBRARY_PAGE = 60;

const achievementKey = (g: Game) => `${g.platform}-${g.accountId ?? ''}-${g.id}`;

function ProfileContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const xboxKey = searchParams.getAll('xbox').join('\n');
  const steamKey = searchParams.getAll('steam').join('\n');
  const psnKey = searchParams.getAll('psn').join('\n');
  const epicKey = searchParams.getAll('epic').join('\n');
  const xboxAccounts = useMemo(() => (xboxKey ? xboxKey.split('\n') : []), [xboxKey]);
  const steamAccounts = useMemo(() => (steamKey ? steamKey.split('\n') : []), [steamKey]);
  const psnAccounts = useMemo(() => (psnKey ? psnKey.split('\n') : []), [psnKey]);
  const epicAccounts = useMemo(() => (epicKey ? epicKey.split('\n') : []), [epicKey]);
  // ?example=1 marks the example profile: it is shown but never saved as the visitor's accounts.
  const isExample = searchParams.get('example') === '1';

  // Same accounts as query params, for the "View dashboard" link.
  const dashboardQuery = useMemo(() => {
    const params = new URLSearchParams();
    xboxAccounts.forEach(id => params.append('xbox', id));
    steamAccounts.forEach(id => params.append('steam', id));
    psnAccounts.forEach(id => params.append('psn', id));
    epicAccounts.forEach(id => params.append('epic', id));
    return params.toString();
  }, [xboxAccounts, steamAccounts, psnAccounts, epicAccounts]);

  // Parse disabled accounts from URL (&off=xbox:2533274800000000,steam:123)
  const disabledAccountsParam = searchParams.get('off') || '';
  const [disabledAccounts, setDisabledAccounts] = useState<Set<string>>(() => {
    return new Set(disabledAccountsParam.split(',').filter(Boolean));
  });

  const [data, setData] = useState<ProfileData | null>(null);
  // Start in the loading state when there are accounts to fetch (no "No profile data" flash).
  const [loading, setLoading] = useState(() => Boolean(xboxKey || steamKey || psnKey || epicKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('lastPlayed');
  const [libraryLimit, setLibraryLimit] = useState(LIBRARY_PAGE);
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [selectedGame, setSelectedGame] = useState<NormalizedGame | null>(null);
  const [achievements, setAchievements] = useState<Record<string, Achievement[]>>({});
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  // ?tab=top6 / ?tab=toplist opens that tab directly (used by the dashboard's "Top 6 showcase" link).
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'library' | 'top6' | 'toplist'>(() =>
    tabParam === 'top6' || tabParam === 'toplist' ? tabParam : 'library'
  );
  // Follow ?tab= when it changes after mount (e.g. arriving from a /u/<code> short link).
  const [seenTabParam, setSeenTabParam] = useState(tabParam);
  if (tabParam !== seenTabParam) {
    setSeenTabParam(tabParam);
    if (tabParam === 'top6' || tabParam === 'toplist') setActiveTab(tabParam);
  }
  const [showTop6Picker, setShowTop6Picker] = useState(false);
  const [top6Initialized, setTop6Initialized] = useState(false);
  const [top6Games, setTop6Games] = useState<NormalizedGame[]>([]);
  const [isExportingTop6, setIsExportingTop6] = useState(false);
  const [showcaseSize, setShowcaseSize] = useState<ShowcaseSize>(6);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const top6ExportRef = useRef<HTMLDivElement>(null);
  const [showAddAccountPanel, setShowAddAccountPanel] = useState(false);
  const [addingAccount, setAddingAccount] = useState<string | null>(null);
  const [top6Subtitle, setTop6Subtitle] = useState('The Games That Shaped Who I Am');
  const [top6ProfilePicture, setTop6ProfilePicture] = useState<string | null>(null);
  const [manualGames, setManualGames] = useState<ManualGame[]>([]);
  const [showManualGameEntry, setShowManualGameEntry] = useState(false);
  
  const storageKey = `profile:${[...xboxAccounts, ...steamAccounts, ...psnAccounts, ...epicAccounts.map(n => `epic:${n}`)].sort().join(',')}`;
  const pictureStorageKey = `avatar:${storageKey}`;
  
  const [profilePictureUrl] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(pictureStorageKey);
    }
    return null;
  });

  // Load Top 6 customization from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    setTimeout(() => {
      const savedSubtitle = localStorage.getItem(`${storageKey}-top6-subtitle`);
      if (savedSubtitle) {
        setTop6Subtitle(savedSubtitle);
      }

      const savedPfp = localStorage.getItem(`${storageKey}-top6-pfp`);
      if (savedPfp) {
        setTop6ProfilePicture(savedPfp);
      }

      // Load manual games
      const manual = getManualGames();
      setManualGames(manual);
    }, 0);
  }, [storageKey]);

  const handleAddManualGame = useCallback((game: Omit<ManualGame, 'addedAt'>) => {
    try {
      saveManualGame(game);
      const updated = getManualGames();
      setManualGames(updated);
      setShowManualGameEntry(false);
    } catch (error) {
      alert('Failed to add game. Please try again.');
    }
  }, []);

  const handleDeleteManualGame = useCallback((gameId: string) => {
    try {
      deleteManualGame(gameId);
      const updated = getManualGames();
      setManualGames(updated);
    } catch (error) {
      alert('Failed to delete game. Please try again.');
    }
  }, []);

  useEffect(() => {
    if (xboxAccounts.length === 0 && steamAccounts.length === 0 && psnAccounts.length === 0 && epicAccounts.length === 0) {
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      xboxAccounts.forEach(gt => params.append('xbox', gt));
      steamAccounts.forEach(id => params.append('steam', id));
      psnAccounts.forEach(id => params.append('psn', id));
      epicAccounts.forEach(id => params.append('epic', id));

      setLoadError(null);
      try {
        const response = await fetch(`/api/profile?${params.toString()}`);
        const result = await response.json().catch(() => null);
        if (response.ok && result && Array.isArray(result.profiles) && Array.isArray(result.games)) {
          setData({ ...result, errors: result.errors ?? {} });
        } else {
          setData(null);
          setLoadError(
            response.status === 429
              ? 'Too many lookups from this network. Please wait a few minutes and try again.'
              : (typeof result?.error === 'string' && result.error) || 'These accounts could not be loaded right now. Please try again shortly.'
          );
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
        setLoadError('Could not reach GAMER.ID. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [xboxAccounts, steamAccounts, psnAccounts, epicAccounts]);

  // Filter data based on enabled accounts
  const filteredData = useMemo<ProfileData | null>(() => {
    if (!data) return null;

    const enabledProfiles = data.profiles.filter(p => {
      const accountKey = `${p.platform}:${p.id}`;
      return !disabledAccounts.has(accountKey);
    });

    const enabledAccountIds = new Set(enabledProfiles.map(p => p.id));
    const filteredGames = data.games.filter(g => {
      const accountId = g.accountId || data.profiles.find(p => p.platform === g.platform)?.id;
      return accountId && enabledAccountIds.has(accountId);
    });

    return {
      profiles: enabledProfiles,
      games: filteredGames,
      playtime: summarizePlaytime(filteredGames, 10),
      errors: data.errors,
      fortnite: data.fortnite,
    };
  }, [data, disabledAccounts]);

  // Remember the visitor's own accounts + toggles in localStorage (browser only, never the example).
  useEffect(() => {
    if (isExample || !data || !Array.isArray(data.profiles) || data.profiles.length === 0) return;
    const params = new URLSearchParams();
    xboxAccounts.forEach(id => params.append('xbox', id));
    steamAccounts.forEach(id => params.append('steam', id));
    psnAccounts.forEach(id => params.append('psn', id));
    epicAccounts.forEach(id => params.append('epic', id));
    saveAccountSet(withDisplayNames(accountsFromParams(params), data.profiles), Array.from(disabledAccounts));
  }, [isExample, data, disabledAccounts, xboxAccounts, steamAccounts, psnAccounts, epicAccounts]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(current => (current === message ? null : current)), 5000);
  }, []);

  const toggleAccount = useCallback((platform: Platform, accountId: string) => {
    const accountKey = `${platform}:${accountId}`;
    const newDisabled = new Set(disabledAccounts);
    
    if (newDisabled.has(accountKey)) {
      newDisabled.delete(accountKey);
    } else {
      // Ensure at least one account stays enabled
      const allAccounts = data?.profiles.map(p => `${p.platform}:${p.id}`) || [];
      if (allAccounts.length - newDisabled.size > 1) {
        newDisabled.add(accountKey);
      } else {
        return; // Can't disable the last account
      }
    }

    setDisabledAccounts(newDisabled);

    // Update URL
    const url = new URL(window.location.href);
    if (newDisabled.size > 0) {
      url.searchParams.set('off', Array.from(newDisabled).join(','));
    } else {
      url.searchParams.delete('off');
    }
    router.replace(url.pathname + url.search, { scroll: false });
  }, [disabledAccounts, data, router]);

  const addAccount = useCallback(async (platform: Platform, identifier: string) => {
    if (!data) return;

    const accountKey = `${platform}:${identifier}`;
    
    // Check if account already exists
    const exists = data.profiles.some(p => 
      p.platform === platform && p.id === identifier
    );
    
    if (exists) {
      throw new Error('This account is already in your pool');
    }

    // Check max accounts
    if (data.profiles.length >= MAX_ACCOUNTS_PER_POOL) {
      throw new Error(`Maximum ${MAX_ACCOUNTS_PER_POOL} accounts allowed per pool`);
    }

    setAddingAccount(accountKey);

    try {
      // Fetch the single account
      const params = new URLSearchParams();
      params.set(platform, identifier);

      const response = await fetch(`/api/profile?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch ${platform} profile`);
      }

      const result = await response.json();

      // Merge with existing data
      const newProfile = result.profiles[0];
      if (!newProfile) {
        throw new Error('Account not found');
      }

      const updatedData: ProfileData = {
        profiles: [...data.profiles, newProfile],
        games: [...data.games, ...result.games],
        errors: { ...data.errors, ...result.errors },
        fortnite: { ...data.fortnite, ...result.fortnite },
      };

      setData(updatedData);
      setShowAddAccountPanel(false);
      showToast(`Added ${newProfile.displayName ?? identifier}.`);

      // Update URL with new account
      const url = new URL(window.location.href);
      url.searchParams.append(platform, identifier);
      // Adding your own account to the example turns it into your own (saved) set.
      url.searchParams.delete('example');
      router.replace(url.pathname + url.search, { scroll: false });

    } catch (error) {
      throw error;
    } finally {
      setAddingAccount(null);
    }
  }, [data, router, showToast]);

  const removeAccount = useCallback((platform: Platform, accountId: string) => {
    if (!data) return;

    // Ensure at least one account remains
    if (data.profiles.length <= 1) {
      showToast('Keep at least one account in the pool.');
      return;
    }

    const accountKey = `${platform}:${accountId}`;

    // Remove from data
    const updatedProfiles = data.profiles.filter(p => !(p.platform === platform && p.id === accountId));
    const updatedGames = data.games.filter(g => {
      const gAccountId = g.accountId || data.profiles.find(p => p.platform === g.platform)?.id;
      return !(g.platform === platform && gAccountId === accountId);
    });

    const updatedData: ProfileData = {
      profiles: updatedProfiles,
      games: updatedGames,
      errors: data.errors,
      fortnite: data.fortnite,
    };

    setData(updatedData);

    // Remove from disabled set if present
    const newDisabled = new Set(disabledAccounts);
    newDisabled.delete(accountKey);
    setDisabledAccounts(newDisabled);

    // Update URL
    const url = new URL(window.location.href);
    const existingAccounts = url.searchParams.getAll(platform);
    url.searchParams.delete(platform);
    // The URL holds what was typed (e.g. a gamertag), the profile holds the resolved id.
    const removedProfile = data.profiles.find(p => p.platform === platform && p.id === accountId);
    const removedName = removedProfile?.displayName?.toLowerCase();
    existingAccounts
      .filter(id => id !== accountId && (!removedName || id.toLowerCase() !== removedName))
      .forEach(id => url.searchParams.append(platform, id));
    
    if (newDisabled.size > 0) {
      url.searchParams.set('off', Array.from(newDisabled).join(','));
    } else {
      url.searchParams.delete('off');
    }

    router.replace(url.pathname + url.search, { scroll: false });
    showToast(`Removed ${removedProfile?.displayName ?? 'account'}.`);
  }, [data, disabledAccounts, router, showToast]);

  // Load Top 6 from URL or localStorage
  useEffect(() => {
    if (!filteredData || top6Initialized) return;
    
    const mergedGames = sortGames(mergeGames(filteredData.games), 'playtime');

    // Showcase size: URL (?size=25) first, then localStorage, else 6.
    let initialSize: ShowcaseSize = 6;
    const sizeParam = Number(searchParams.get('size'));
    if (isShowcaseSize(sizeParam)) initialSize = sizeParam;
    else {
      try {
        const storedSize = Number(localStorage.getItem(`top6size:${storageKey}`));
        if (isShowcaseSize(storedSize)) initialSize = storedSize;
      } catch { /* ignore */ }
    }
    
    const loadTop6 = () => {
      // Try URL first
      const top6Param = searchParams.get('top6');
      if (top6Param) {
        try {
          const gameKeys = top6Param.split(',');
          const selectedGames = gameKeys
            .map(key => {
              const [platform, id] = key.split('-');
              return mergedGames.find(mg => 
                mg.games.some(g => g.platform === platform && g.id === id)
              );
            })
            .filter((g): g is NormalizedGame => g !== undefined)
            .slice(0, 50);
          if (selectedGames.length > 0) {
            return selectedGames;
          }
        } catch (e) {
          console.error('Failed to parse top6 param:', e);
        }
      }

      // Try localStorage
      const top6StorageKey = `top6:${storageKey}`;
      try {
        const stored = localStorage.getItem(top6StorageKey);
        if (stored) {
          const storedTitles = JSON.parse(stored) as string[];
          const selectedGames = storedTitles
            .map(title => mergedGames.find(g => g.normalizedTitle === title))
            .filter((g): g is NormalizedGame => g !== undefined)
            .slice(0, 50);
          if (selectedGames.length > 0) {
            return selectedGames;
          }
        }
      } catch (e) {
        console.error('Failed to load Top 6 from localStorage:', e);
      }

      // Default to top N by hours
      return mergedGames.slice(0, initialSize);
    };

    const picked = loadTop6();
    // Fill empty slots (e.g. 6 saved picks shown as a Top 25) with the most played games.
    const loaded = fillSelection(picked, mergedGames, Math.max(initialSize, picked.length), g => g.normalizedTitle);
    if (loaded) {
      setTimeout(() => {
        setShowcaseSize(initialSize);
        setTop6Games(loaded);
        setTop6Initialized(true);
      }, 0);
    }
  }, [filteredData, top6Initialized, searchParams, storageKey]);

  const handleTop6Change = useCallback((games: NormalizedGame[]) => {
    setTop6Games(games);
    
    // Save to localStorage
    const top6StorageKey = `top6:${storageKey}`;
    const titles = games.map(g => g.normalizedTitle);
    localStorage.setItem(top6StorageKey, JSON.stringify(titles));
    
    // Update URL
    const url = new URL(window.location.href);
    const gameKeys = games.map(g => {
      const firstGame = g.games[0];
      return `${firstGame.platform}-${firstGame.id}`;
    });
    if (gameKeys.length > 0) {
      url.searchParams.set('top6', gameKeys.join(','));
    } else {
      url.searchParams.delete('top6');
    }
    router.replace(url.pathname + url.search, { scroll: false });
  }, [storageKey, router]);

  const handleShowcaseSizeChange = useCallback((size: ShowcaseSize) => {
    setShowcaseSize(size);
    try { localStorage.setItem(`top6size:${storageKey}`, String(size)); } catch { /* ignore */ }
    const url = new URL(window.location.href);
    if (filteredData && top6Games.length < size) {
      const ranked = sortGames(mergeGames(filteredData.games), 'playtime');
      const next = fillSelection(top6Games, ranked, size, g => g.normalizedTitle);
      setTop6Games(next);
      try { localStorage.setItem(`top6:${storageKey}`, JSON.stringify(next.map(g => g.normalizedTitle))); } catch { /* ignore */ }
      url.searchParams.set('top6', next.map(g => `${g.games[0].platform}-${g.games[0].id}`).join(','));
    }
    if (size === 6) url.searchParams.delete('size'); else url.searchParams.set('size', String(size));
    router.replace(url.pathname + url.search, { scroll: false });
  }, [filteredData, top6Games, storageKey, router]);


  /** Render the hidden export card to an image (shared by Save, Share on X). */
  const generateShowcaseImage = useCallback(async () => {
    if (!top6ExportRef.current || !filteredData || !data) return null;
    const playerName = pickHeaderIdentity(data.profiles, disabledAccounts).displayName;
    setExportNote(null);
    // Covers are fetched through /api/image, decoded and scaled to tile size first,
    // and the canvas is kept inside a pixel / 5 MB budget (see lib/export).
    const result = await exportNodeToImage(top6ExportRef.current, {
      preferredPixelRatio: showcaseLayout(showcaseSize).pixelRatio,
      backgroundColor: '#09090b',
    });
    if (result.failedImages > 0) {
      setExportNote(`${result.failedImages} cover${result.failedImages === 1 ? '' : 's'} could not be loaded and were replaced with a title card.`);
    }
    const baseName = `${playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gamer-id'}-top${showcaseSize}`;
    return { result, baseName };
  }, [filteredData, data, showcaseSize, disabledAccounts]);

  const handleExportTop6 = useCallback(async () => {
    setIsExportingTop6(true);
    try {
      const out = await generateShowcaseImage();
      if (out) {
        downloadBlob(out.result.blob, out.baseName);
        showToast('Image saved.');
      }
    } catch (error) {
      console.error('Failed to export Top 6:', error);
      showToast('Could not create the image. Please try again.');
    } finally {
      setIsExportingTop6(false);
    }
  }, [generateShowcaseImage, showToast]);

  /** The visitor's full profile link (their accounts + this showcase); fallback for short links. */
  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'top6');
    return url.toString();
  }, []);

  // One short link per account set + view (cached so repeat clicks don't hit the API).
  const shortLinkCache = useRef(new Map<string, string>());
  /** Short /u/<code> link for sharing, via POST /api/share. Falls back to the full /p URL. */
  const getShareUrl = useCallback(async () => {
    const params = new URL(window.location.href).searchParams;
    const top6 = (params.get('top6') ?? '').split(',').filter(Boolean);
    const body = {
      xbox: params.getAll('xbox'),
      steam: params.getAll('steam'),
      psn: params.getAll('psn'),
      epic: params.getAll('epic'),
      off: (params.get('off') ?? '').split(',').filter(Boolean),
      name: data ? pickHeaderIdentity(data.profiles, disabledAccounts).displayName : undefined,
      size: showcaseSize,
      ...(top6.length ? { top6 } : {}),
      tab: 'top6' as const,
      example: params.get('example') === '1',
    };
    const cacheKey = JSON.stringify(body);
    const cached = shortLinkCache.current.get(cacheKey);
    if (cached) return cached;
    try {
      let res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cacheKey });
      if (res.status === 400 && body.name) {
        // A display name with unusual characters: share without it.
        const { name: _name, ...rest } = body;
        void _name;
        res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest) });
      }
      const json = await res.json();
      if (res.ok && typeof json?.url === 'string') {
        shortLinkCache.current.set(cacheKey, json.url);
        return json.url as string;
      }
    } catch {
      /* fall back to the full link */
    }
    return buildShareUrl();
  }, [data, disabledAccounts, showcaseSize, buildShareUrl]);

  const handleCopyLink = useCallback(async () => {
    const link = await getShareUrl();
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied.');
    } catch {
      window.prompt('Copy this link:', link);
    }
  }, [getShareUrl, showToast]);

  /**
   * Share on X: always ends on the X composer. Saves the image first (so it can be
   * attached), then opens the post intent: a new tab on desktop, a normal navigation
   * on phones (which hands off to the X app when installed).
   */
  // Share on X prepares the image + short link as soon as the pointer/finger reaches the
  // button, so the click itself can save the image and open X synchronously. (Opening a
  // blank tab first would background this page and stall the canvas export.)
  type PreparedShare = { key: string; image: { blob: Blob; baseName: string } | null; url: string };
  const preparedShare = useRef<{ key: string; promise: Promise<PreparedShare>; value?: PreparedShare } | null>(null);
  const shareStateKey = useCallback(
    () => JSON.stringify([window.location.search, showcaseSize, top6ProfilePicture, top6Subtitle, profilePictureUrl, Array.from(disabledAccounts)]),
    [showcaseSize, top6ProfilePicture, top6Subtitle, profilePictureUrl, disabledAccounts],
  );
  const prepareShare = useCallback((): Promise<PreparedShare> => {
    const key = shareStateKey();
    const existing = preparedShare.current;
    if (existing && existing.key === key) return existing.promise;
    const entry: { key: string; promise: Promise<PreparedShare>; value?: PreparedShare } = { key, promise: Promise.resolve(null as unknown as PreparedShare) };
    entry.promise = (async () => {
      const urlPromise = getShareUrl();
      let image: PreparedShare['image'] = null;
      try {
        const out = await generateShowcaseImage();
        if (out) image = { blob: out.result.blob, baseName: out.baseName };
      } catch (error) {
        console.error('Failed to create the showcase image:', error);
      }
      const value = { key, image, url: await urlPromise };
      entry.value = value;
      if (!image && preparedShare.current === entry) preparedShare.current = null; // retry next time
      return value;
    })();
    preparedShare.current = entry;
    return entry.promise;
  }, [shareStateKey, getShareUrl, generateShowcaseImage]);

  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const handleShareOnX = useCallback(async (shareText: string) => {
    const isPhone = window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 1024;
    const key = shareStateKey();
    let ready = preparedShare.current?.key === key ? preparedShare.current.value : undefined;
    const synchronous = Boolean(ready);
    if (!ready) {
      setIsSharing(true);
      try {
        ready = await prepareShare();
      } finally {
        setIsSharing(false);
      }
    }
    if (ready.image) {
      downloadBlob(ready.image.blob, ready.image.baseName);
      showToast('Image saved. Attach it to your post.');
    } else {
      showToast('Could not create the image. Opening X anyway.');
    }
    const intent = buildXIntentUrl(shareText, ready.url);
    console.info('[share] X intent:', intent);

    if (isPhone) {
      // Normal navigation opens the X app if installed; give the download a moment first.
      window.setTimeout(() => { window.location.href = intent; }, 800);
      return;
    }
    const w = window.open(intent, '_blank');
    if (w) {
      w.opener = null;
    } else {
      // Popup blocked (the click's activation expired while the image was generated).
      console.info('[share] popup blocked after', synchronous ? 'sync' : 'async', 'prepare');
      setPendingIntent(intent);
    }
  }, [shareStateKey, prepareShare, showToast]);

  const fetchAchievements = async (game: NormalizedGame) => {
    if (!filteredData) return;
    
    setSelectedGame(game);
    setLoadingAchievements(true);

    const newAchievements: Record<string, Achievement[]> = {};

    for (const g of game.games) {
      if (g.platform === 'epic') continue; // Fortnite stats have no achievements
      const playerId = g.accountId ?? filteredData.profiles.find(p => p.platform === g.platform)?.id;
      if (!playerId) continue;

      const key = achievementKey(g);
      if (achievements[key]) {
        newAchievements[key] = achievements[key];
        continue;
      }

      try {
        const response = await fetch(
          `/api/achievements?platform=${g.platform}&playerId=${encodeURIComponent(playerId)}&gameId=${encodeURIComponent(g.id)}`
        );
        const result = await response.json();
        if (result.achievements) {
          newAchievements[key] = result.achievements;
        }
      } catch (error) {
        console.error(`Failed to fetch achievements for ${g.platform}:`, error);
      }
    }

    setAchievements({ ...achievements, ...newAchievements });
    setLoadingAchievements(false);
  };

  if (loading) return <ProfileSkeleton />;

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="max-w-md text-center" role="alert">
            <h1 className="text-lg font-semibold text-white">Couldn&apos;t load this profile</h1>
            <p className="mt-2 text-sm text-zinc-400">{loadError}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
              <Link href="/" className="btn btn-secondary">Look up accounts</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !filteredData) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="text-center">
            <h1 className="text-white text-lg font-semibold mb-4">No accounts to show</h1>
            <div className="mx-auto mb-4 max-w-md text-left">
              <SavedAccountsPanel showRecent={false} />
            </div>
            <Link href="/" className="btn btn-primary">
              Look up accounts
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Every account failed (private or not found): explain instead of rendering an empty profile.
  if (data.profiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg text-center">
            <h1 className="text-lg font-semibold text-white">These accounts couldn&apos;t be loaded</h1>
            <AccountErrors errors={data.errors} className="mt-4" />
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Try again</button>
              <Link href="/" className="btn btn-primary">Look up accounts</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Merge manual games with API games
  const allGames = [
    ...filteredData.games,
    ...manualGames.map(manualGameToGame),
  ];
  
  const mergedGames = sortGames(filterGames(mergeGames(allGames), filterBy), sortBy);
  const playtime = filteredData.playtime ?? { totalMinutes: 0, byPlatform: {}, topCombined: [] };
  const platformTotals = Object.entries(playtime.byPlatform) as Array<[Platform, NonNullable<PlaytimeSummary['byPlatform'][Platform]>]>;
  
  const totalAchievementsEarned = mergedGames.reduce((sum, g) => sum + g.achievementProgress.earned, 0);
  
  // Header follows the account toggles: first enabled account (or the chosen picture).
  const headerIdentity = pickHeaderIdentity(data.profiles, disabledAccounts, profilePictureUrl);
  const displayAvatar = headerIdentity.avatarUrl;
  const displayName = headerIdentity.displayName;

  const enabledCount = data.profiles.length - disabledAccounts.size;
  const sharePlatformCount = platformTotals.length;
  const shareText = buildShareText(formatShowcaseHours(playtime.totalMinutes), sharePlatformCount, showcaseSize);
  const totalCount = data.profiles.length;

  return (
    <div className="flex-1 text-zinc-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Profile <-> dashboard switch (same accounts) */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Profile views" className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/40 p-0.5 text-sm">
            <span className="inline-flex min-h-11 items-center rounded px-3 sm:min-h-10 font-medium text-zinc-100 bg-zinc-800" aria-current="page">Profile</span>
            {dashboardQuery && (
              <Link
                href={isExample ? '/dashboard?example=1' : `/dashboard?${dashboardQuery}${disabledAccounts.size ? `&off=${encodeURIComponent(Array.from(disabledAccounts).join(','))}` : ''}`}
                className="inline-flex min-h-11 items-center rounded px-3 sm:min-h-10 font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Dashboard
              </Link>
            )}
          </nav>
          {isExample && (
            <p className="text-sm text-zinc-400">
              {getDemoLabel()}.{' '}
              <Link href="/" className="text-link">Look up your own</Link>
            </p>
          )}
        </div>


        <h1 className="sr-only">{displayName}&apos;s gaming profile</h1>
        <AccountErrors errors={data.errors} className="mb-6" />

        {/* Account Toggles */}
        {data.profiles.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-zinc-400" aria-live="polite">
                {enabledCount} of {totalCount} account{totalCount !== 1 ? 's' : ''} selected
              </h2>
              <button
                type="button"
                aria-expanded={showAddAccountPanel}
                onClick={() => setShowAddAccountPanel(!showAddAccountPanel)}
                disabled={data.profiles.length >= MAX_ACCOUNTS_PER_POOL}
                className="btn btn-secondary"
              >
                Add account
              </button>
            </div>

            {showAddAccountPanel && (
              <div className="mb-4">
                <AddAccountPanel
                  onAdd={addAccount}
                  onCancel={() => setShowAddAccountPanel(false)}
                  currentAccountCount={data.profiles.length}
                  maxAccounts={MAX_ACCOUNTS_PER_POOL}
                />
              </div>
            )}

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Accounts in this pool">
              {data.profiles.map(profile => {
                const accountKey = `${profile.platform}:${profile.id}`;
                const isEnabled = !disabledAccounts.has(accountKey);
                const isLastEnabled = enabledCount === 1 && isEnabled;
                const isBeingAdded = addingAccount === accountKey;

                return (
                  <li
                    key={accountKey}
                    className={`
                      relative flex min-w-0 items-center gap-2 px-3 py-2 rounded-lg border transition-all
                      ${isEnabled 
                        ? 'bg-zinc-900/60 border-zinc-700' 
                        : 'bg-zinc-950 border-zinc-800 opacity-50'
                      }
                      ${isBeingAdded ? 'animate-pulse' : ''}
                    `}
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`Include ${profile.displayName} (${platformNames[profile.platform]}) in totals`}
                      title={isLastEnabled ? 'At least one account must stay selected' : undefined}
                      onClick={() => toggleAccount(profile.platform, profile.id)}
                      disabled={isLastEnabled || isBeingAdded}
                      className={`
                        flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md py-1
                        ${isLastEnabled || isBeingAdded ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80 active:opacity-70'}
                      `}
                    >
                      {profile.avatarUrl && (
                        <img
                          src={profile.avatarUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full"
                        />
                      )}
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{profile.displayName}</span>
                          <span className="shrink-0 text-xs text-zinc-400 capitalize">{platformNames[profile.platform]}</span>
                        </div>
                        {profile.totalPlaytimeMinutes !== undefined && (
                          <div className="text-sm text-zinc-400">
                            {formatHours(profile.totalPlaytimeMinutes)}
                          </div>
                        )}
                      </div>
                      <div aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                        isEnabled ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-700'
                      }`}>
                        {isEnabled && (
                          <svg className="w-3 h-3 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>

                    {/* Remove button */}
                    {data.profiles.length > 1 && !isBeingAdded && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${profile.displayName} from your pool?`)) {
                            removeAccount(profile.platform, profile.id);
                          }
                        }}
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-400/10 hover:text-red-400 active:bg-red-400/20"
                        title="Remove account"
                        aria-label={`Remove ${profile.displayName} from the pool`}
                      >
                        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}

                    {isBeingAdded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 rounded-lg">
                        <div className="text-sm text-white">Adding…</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-1">
            <ProfileCard
              profile={{
                id: 'merged',
                displayName: displayName,
                avatarUrl: displayAvatar,
                platform: filteredData.profiles[0].platform,
                gameCount: mergedGames.length,
                totalPlaytimeMinutes: playtime.totalMinutes > 0 ? playtime.totalMinutes : undefined,
              }}
            />

            <div className="mt-6 space-y-3">
              <div className="card p-4">
                <div className="text-sm text-zinc-400 mb-1">Total Playtime</div>
                <div className="text-2xl font-semibold tabular-nums">{formatHours(playtime.totalMinutes)}</div>
              </div>

              <div className="card p-4">
                <div className="text-sm text-zinc-400 mb-1">Games Played</div>
                <div className="text-2xl font-semibold tabular-nums">{mergedGames.length}</div>
              </div>

              <div className="card p-4">
                <div className="text-sm text-zinc-400 mb-1">Achievements</div>
                <div className="text-2xl font-semibold tabular-nums">{totalAchievementsEarned.toLocaleString()}</div>
              </div>

              {/* Playtime Accuracy Note */}
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                    Hours may be incomplete for older games. Xbox 360 and older titles never recorded playtime, so those show as &quot;Playtime unknown&quot; and aren&apos;t counted in totals. Some platforms also only report partial history.
                  </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Playtime by Platform</h2>
              <div className="grid grid-cols-2 gap-4">
                {platformTotals.map(([platform, total]) => (
                  <div key={platform} className="card p-4">
                    <div className="text-sm text-zinc-400 mb-1 capitalize">{platformNames[platform]}</div>
                    <div className="text-2xl font-semibold tabular-nums mb-1">{total.gamesWithData > 0 ? formatHours(total.minutes) : 'Unknown'}</div>
                    <div className="text-xs text-zinc-400">
                      {total.gamesWithData} with data
                      {total.gamesUnknown > 0 && `, ${total.gamesUnknown} unknown`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Top Games by Hours</h2>
              <div className="space-y-2">
                {playtime.topCombined.slice(0, 5).map(entry => (
                  <div key={entry.normalizedTitle} className="card px-4 py-3 flex justify-between items-center">
                    <span className="text-sm">{entry.title}</span>
                    <span className="text-sm tabular-nums text-zinc-300">{formatHours(entry.totalMinutes)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filteredData.fortnite && (() => {
          const enabledEpic = filteredData.profiles.filter(p => p.platform === 'epic' && filteredData.fortnite?.[p.id]);
          if (enabledEpic.length === 0) return null;
          return (
            <div className="mb-8 space-y-4">
              {enabledEpic.map(p => <FortniteCard key={p.id} stats={filteredData.fortnite![p.id]} />)}
            </div>
          );
        })()}

        <div id="profile-tabs" role="tablist" aria-label="Profile sections" className="mb-6 flex items-center gap-2 border-b border-zinc-800 overflow-x-auto scroll-mt-24">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'library'}
            onClick={() => setActiveTab('library')}
            className={`-mb-px min-h-11 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'library'
                ? 'text-zinc-100 border-b-2 border-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 active:text-zinc-100'
            }`}
          >
            Game Library
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'top6'}
            onClick={() => setActiveTab('top6')}
            className={`-mb-px min-h-11 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'top6'
                ? 'text-zinc-100 border-b-2 border-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 active:text-zinc-100'
            }`}
          >
            Top {showcaseSize} showcase
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'toplist'}
            onClick={() => setActiveTab('toplist')}
            className={`-mb-px min-h-11 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'toplist'
                ? 'text-zinc-100 border-b-2 border-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 active:text-zinc-100'
            }`}
          >
            Top List
          </button>
        </div>

        {activeTab === 'library' && (
          <>
            <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort games"
                  className="field min-h-11 px-3 py-2 text-sm sm:min-h-10"
                >
                  <option value="lastPlayed">Last Played</option>
                  <option value="playtime">Most Played</option>
                  <option value="completion">Completion %</option>
                  <option value="title">Title A-Z</option>
                </select>

                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                  aria-label="Filter by platform"
                  className="field min-h-11 px-3 py-2 text-sm sm:min-h-10"
                >
                  <option value="all">All Platforms</option>
                  <option value="xbox">Xbox Only</option>
                  <option value="steam">Steam Only</option>
                  <option value="psn">PSN Only</option>
                  <option value="epic">Epic / Fortnite Only</option>
                </select>
              </div>

              <button
                onClick={() => setShowManualGameEntry(!showManualGameEntry)}
                className="btn btn-ghost"
              >
                Add a game manually
              </button>
            </div>

            {showManualGameEntry && (
              <div className="mb-6">
                <ManualGameEntry
                  onAdd={handleAddManualGame}
                  onCancel={() => setShowManualGameEntry(false)}
                />
              </div>
            )}

            {manualGames.length > 0 && (
              <div className="mb-6">
                <ManualGameList
                  games={manualGames}
                  onDelete={handleDeleteManualGame}
                />
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {mergedGames.slice(0, libraryLimit).map((game) => (
                <GameCard key={game.normalizedTitle} game={game} onClick={() => fetchAchievements(game)} />
              ))}
            </div>
            {mergedGames.length > libraryLimit && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <p className="text-sm text-zinc-400">Showing {libraryLimit} of {mergedGames.length.toLocaleString()} games</p>
                <button type="button" className="btn btn-secondary" onClick={() => setLibraryLimit(n => n + LIBRARY_PAGE)}>
                  Show {Math.min(LIBRARY_PAGE, mergedGames.length - libraryLimit)} more
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'top6' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-xl font-semibold">My Top {showcaseSize} Showcase</h2>
              <div className="flex gap-3 flex-wrap">
                <div className="flex rounded-md overflow-hidden border border-zinc-800" role="group" aria-label="Showcase size">
                  {SHOWCASE_SIZES.map(n => (
                    <button
                      key={n}
                      onClick={() => handleShowcaseSizeChange(n)}
                      aria-pressed={showcaseSize === n}
                      data-showcase-size={n}
                      type="button"
                      className={`min-h-11 px-3 py-2 text-sm font-medium transition-colors sm:min-h-10 ${showcaseSize === n ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100 active:bg-zinc-800'}`}
                    >
                      Top {n}
                    </button>
                  ))}
                </div>
                <Top6SubtitleEditor
                  currentSubtitle={top6Subtitle}
                  onSave={setTop6Subtitle}
                  storageKey={storageKey}
                />
                <Top6ProfilePictureSelector
                  profiles={data.profiles}
                  currentPictureUrl={top6ProfilePicture || displayAvatar}
                  onSelect={setTop6ProfilePicture}
                  storageKey={storageKey}
                />
                <button
                  type="button"
                  onClick={handleExportTop6}
                  disabled={isExportingTop6 || isSharing || top6Games.length === 0}
                  className="btn btn-secondary"
                >
                  {isExportingTop6 ? (
                    <>
                      <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Exporting...
                    </>
                  ) : (
                    <>Save image</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleShareOnX(shareText)}
                  onPointerEnter={() => { if (top6Games.length) void prepareShare(); }}
                  onTouchStart={() => { if (top6Games.length) void prepareShare(); }}
                  onFocus={() => { if (top6Games.length) void prepareShare(); }}
                  disabled={isSharing || isExportingTop6 || top6Games.length === 0}
                  className="btn btn-primary"
                >
                  {isSharing ? 'Preparing…' : 'Share on X'}
                </button>
                <button type="button" onClick={handleCopyLink} className="btn btn-secondary">
                  Copy link
                </button>
                <button
                  type="button"
                  aria-expanded={showTop6Picker}
                  onClick={() => setShowTop6Picker(!showTop6Picker)}
                  className="btn btn-secondary"
                >
                  {showTop6Picker ? 'Done' : 'Choose Games'}
                </button>
              </div>
            </div>

            {showTop6Picker && (
              <Top6Picker
                allGames={mergedGames}
                maxGames={showcaseSize}
                selectedGames={top6Games.slice(0, showcaseSize)}
                onSelectionChange={handleTop6Change}
                disabledAccounts={disabledAccounts}
              />
            )}

            {exportNote && <p className="text-sm text-amber-400">{exportNote}</p>}

            <Top6Showcase
              size={showcaseSize}
              games={top6Games.slice(0, showcaseSize)}
              playerName={displayName}
              avatarUrl={top6ProfilePicture || displayAvatar}
              subtitle={top6Subtitle}
              disabledAccounts={disabledAccounts}
            />

            {/* Hidden export view */}
            <div className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
              <div ref={top6ExportRef}>
                <Top6ExportCard
                  size={showcaseSize}
                  totalMinutes={playtime.totalMinutes}
                  accountCount={enabledCount}
                  games={top6Games.slice(0, showcaseSize)}
                  playerName={displayName}
                  avatarUrl={top6ProfilePicture || displayAvatar}
                  subtitle={top6Subtitle}
                  disabledAccounts={disabledAccounts}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'toplist' && (
          <TopList games={mergedGames} playerName={displayName} avatarUrl={displayAvatar} />
        )}
      </div>

      {pendingIntent && (
        <div role="dialog" aria-label="Open X" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 shadow-lg">
          <span>Image saved.</span>
          <a href={pendingIntent} target="_blank" rel="noopener noreferrer" className="btn btn-primary" onClick={() => setPendingIntent(null)}>
            Open X
          </a>
          <button type="button" className="min-h-11 px-2 text-zinc-400 hover:text-zinc-100" onClick={() => setPendingIntent(null)} aria-label="Dismiss">
            Close
          </button>
        </div>
      )}

      {toast && !pendingIntent && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 shadow-lg">
          {toast}
        </div>
      )}

      {selectedGame && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedGame(null)} onKeyDown={(e) => { if (e.key === 'Escape') setSelectedGame(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`${selectedGame.games[0].title} achievements`} className="bg-zinc-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">{selectedGame.games[0].title}</h2>
              <button type="button" autoFocus aria-label="Close" onClick={() => setSelectedGame(null)} className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white">
                <svg aria-hidden="true" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {loadingAchievements ? (
                <div className="text-center py-8 text-zinc-400">Loading achievements...</div>
              ) : (
                selectedGame.games.map(g => {
                  const key = achievementKey(g);
                  const gameAchievements = achievements[key];
                  if (!gameAchievements || gameAchievements.length === 0) return null;

                  return (
                    <div key={key} className="mb-6">
                      <h3 className="text-lg font-medium mb-3 capitalize">
                        {platformNames[g.platform]}
                        {g.accountId && ` - ${filteredData.profiles.find(p => p.id === g.accountId)?.displayName}`}
                      </h3>
                      <AchievementList achievements={gameAchievements} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileContent;
