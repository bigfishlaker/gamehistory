import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveAccountSet,
  getCurrentAccountSet,
  getRecentAccountSets,
  forgetCurrentAccountSet,
  removeRecentAccountSet,
  accountSetKey,
  accountSetQuery,
  accountSetLabel,
  withDisplayNames,
  accountsFromParams,
  parseAccountSet,
  setPendingAccounts,
  getPendingAccounts,
  MAX_RECENT,
} from '../lib/saved-accounts';
import { DEMO_ACCOUNTS, getDemoLabel, getDemoProfileUrl, getDemoSummary } from '../lib/demo-accounts';

const gabe = { platform: 'steam' as const, identifier: '76561197960287930', displayName: 'Rabscuttle' };
const nelson = { platform: 'xbox' as const, identifier: 'Major Nelson', displayName: 'Major Nelson' };

describe('saved accounts (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('saves the current set and restores it', () => {
    saveAccountSet([gabe], ['steam:76561197960287930']);
    const current = getCurrentAccountSet();
    expect(current?.accounts).toEqual([gabe]);
    expect(current?.off).toEqual(['steam:76561197960287930']);
    expect(getRecentAccountSets()).toHaveLength(1);
  });

  it('keeps the last 5 distinct sets, newest first, without duplicates', () => {
    for (let i = 0; i < 7; i++) saveAccountSet([{ platform: 'psn', identifier: `user${i}` }]);
    saveAccountSet([{ platform: 'psn', identifier: 'USER6' }]); // same set, different case
    const recent = getRecentAccountSets();
    expect(recent).toHaveLength(MAX_RECENT);
    expect(recent[0].accounts[0].identifier.toLowerCase()).toBe('user6');
    expect(recent.map(s => s.accounts[0].identifier.toLowerCase())).toEqual(['user6', 'user5', 'user4', 'user3', 'user2']);
  });

  it('forgets the current set and its recent entry', () => {
    saveAccountSet([nelson]);
    saveAccountSet([gabe]);
    forgetCurrentAccountSet();
    expect(getCurrentAccountSet()).toBeNull();
    expect(getRecentAccountSets().map(s => accountSetKey(s.accounts))).toEqual([accountSetKey([nelson])]);
    removeRecentAccountSet(accountSetKey([nelson]));
    expect(getRecentAccountSets()).toEqual([]);
  });

  it('ignores corrupt or hostile storage values', () => {
    expect(parseAccountSet('not json')).toBeNull();
    expect(parseAccountSet(JSON.stringify({ accounts: [{ platform: 'evil', identifier: 'x' }] }))).toBeNull();
    localStorage.setItem('gamerid:accounts:recent:v1', '{"oops":1}');
    expect(getRecentAccountSets()).toEqual([]);
  });

  it('builds query strings, labels and display names', () => {
    const set = { accounts: [gabe, nelson], off: ['xbox:123'] };
    expect(accountSetQuery(set)).toBe('xbox=Major+Nelson&steam=76561197960287930&off=xbox%3A123');
    expect(accountSetLabel(set)).toBe('Rabscuttle, Major Nelson');
    const entries = accountsFromParams(new URLSearchParams('steam=76561197960287930&xbox=major%20nelson'));
    expect(entries).toEqual([
      { platform: 'xbox', identifier: 'major nelson' },
      { platform: 'steam', identifier: '76561197960287930' },
    ]);
    const named = withDisplayNames(entries, [
      { platform: 'xbox', id: '2584878536129841', displayName: 'Major Nelson' },
      { platform: 'steam', id: '76561197960287930', displayName: 'Rabscuttle' },
    ]);
    expect(named.map(a => a.displayName)).toEqual(['Major Nelson', 'Rabscuttle']);
  });

  it('keeps SearchForm pending accounts in sessionStorage', () => {
    setPendingAccounts([gabe]);
    expect(getPendingAccounts()).toEqual([gabe]);
    setPendingAccounts([]);
    expect(getPendingAccounts()).toEqual([]);
  });
});

describe('example (demo) accounts', () => {
  it('is a single public Xbox account, not the creator', () => {
    expect(DEMO_ACCOUNTS).toEqual([{ platform: 'xbox', identifier: 'Stallion83', displayName: 'Stallion83' }]);
    expect(getDemoSummary()).toEqual({ accountCount: 1, platformCount: 1, platforms: ['xbox'] });
    expect(getDemoLabel()).toBe('Example: Stallion83 (public Xbox profile)');
  });

  it('marks the example profile URL so it is never saved', () => {
    expect(getDemoProfileUrl()).toBe('/p?xbox=Stallion83&example=1');
  });
});
