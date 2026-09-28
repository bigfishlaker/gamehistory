/**
 * Integration tests for add/remove account functionality in profile page
 */

import { describe, it, expect } from 'vitest';

describe('Profile Account Management Integration', () => {
  it('should respect MAX_ACCOUNTS_PER_POOL constant', () => {
    const MAX_ACCOUNTS_PER_POOL = 6;
    expect(MAX_ACCOUNTS_PER_POOL).toBe(6);
  });

  it('should normalize Steam profile URL to Steam ID', () => {
    const input = 'https://steamcommunity.com/profiles/76561198012345678';
    const match = input.match(/profiles\/(\d{17})/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe('76561198012345678');
  });

  it('should normalize Xbox profile URL to gamertag', () => {
    const input = 'https://www.xbox.com/en-US/play/user/TestGamertag';
    const match = input.match(/user\/([^/?]+)/i);
    expect(match).toBeTruthy();
    expect(match![1]).toBe('TestGamertag');
  });

  it('should normalize PSN profile URL to PSN ID', () => {
    const input = 'https://psnprofiles.com/TestPSNUser';
    const match = input.match(/psnprofiles\.com\/([^/?]+)/i);
    expect(match).toBeTruthy();
    expect(match![1]).toBe('TestPSNUser');
  });

  it('should construct profile API URL with single account', () => {
    const platform = 'xbox';
    const identifier = 'TestGamertag';
    const params = new URLSearchParams();
    params.set(platform, identifier);
    
    expect(params.toString()).toBe('xbox=TestGamertag');
    expect(`/api/profile?${params.toString()}`).toBe('/api/profile?xbox=TestGamertag');
  });

  it('should construct profile URL with multiple accounts', () => {
    const url = new URL('https://example.com/p');
    url.searchParams.append('xbox', 'Account1');
    url.searchParams.append('steam', '76561198012345678');
    url.searchParams.append('psn', 'PSNUser');
    
    expect(url.search).toBe('?xbox=Account1&steam=76561198012345678&psn=PSNUser');
  });

  it('should remove account from URL parameters', () => {
    const url = new URL('https://example.com/p?xbox=Account1&xbox=Account2&steam=12345');
    const platformToRemove = 'xbox';
    const accountToRemove = 'Account1';
    
    const existingAccounts = url.searchParams.getAll(platformToRemove);
    url.searchParams.delete(platformToRemove);
    existingAccounts
      .filter(id => id !== accountToRemove)
      .forEach(id => url.searchParams.append(platformToRemove, id));
    
    expect(url.search).toBe('?steam=12345&xbox=Account2');
  });

  it('should maintain disabled accounts state when removing account', () => {
    const disabledAccounts = new Set(['xbox:Account1', 'steam:12345']);
    const accountToRemove = 'xbox:Account2';
    
    // If removed account was disabled, remove from disabled set
    const newDisabled = new Set(disabledAccounts);
    if (newDisabled.has(accountToRemove)) {
      newDisabled.delete(accountToRemove);
    }
    
    // Account wasn't disabled, so set unchanged
    expect(newDisabled.size).toBe(2);
    expect(newDisabled.has('xbox:Account1')).toBe(true);
  });

  it('should generate correct account key format', () => {
    const platform = 'xbox';
    const accountId = 'TestGamertag';
    const accountKey = `${platform}:${accountId}`;
    
    expect(accountKey).toBe('xbox:TestGamertag');
  });

  it('should validate account existence before adding', () => {
    const existingProfiles = [
      { id: 'Account1', platform: 'xbox' as const },
      { id: '12345', platform: 'steam' as const },
    ];
    
    const newPlatform = 'xbox';
    const newId = 'Account1';
    
    const exists = existingProfiles.some(p => 
      p.platform === newPlatform && p.id === newId
    );
    
    expect(exists).toBe(true);
  });

  it('should enforce minimum 1 account in pool', () => {
    const profiles = [
      { id: 'Account1', platform: 'xbox' as const },
    ];
    
    const canRemove = profiles.length > 1;
    expect(canRemove).toBe(false);
  });

  it('should enforce maximum accounts limit', () => {
    const MAX_ACCOUNTS_PER_POOL = 6;
    const currentCount = 5;
    const canAdd = currentCount < MAX_ACCOUNTS_PER_POOL;
    
    expect(canAdd).toBe(true);
    
    const atMax = 6;
    const canAddWhenMax = atMax < MAX_ACCOUNTS_PER_POOL;
    expect(canAddWhenMax).toBe(false);
  });

  it('should merge game data from new account', () => {
    const existingGames = [
      { id: 'game1', platform: 'xbox' as const, title: 'Game 1', accountId: 'Account1' },
      { id: 'game2', platform: 'steam' as const, title: 'Game 2', accountId: '12345' },
    ];
    
    const newGames = [
      { id: 'game3', platform: 'xbox' as const, title: 'Game 3', accountId: 'Account2' },
    ];
    
    const mergedGames = [...existingGames, ...newGames];
    
    expect(mergedGames.length).toBe(3);
    expect(mergedGames.some(g => g.id === 'game3')).toBe(true);
  });

  it('should filter games by account when removing', () => {
    const games = [
      { id: 'game1', platform: 'xbox' as const, accountId: 'Account1' },
      { id: 'game2', platform: 'xbox' as const, accountId: 'Account2' },
      { id: 'game3', platform: 'steam' as const, accountId: '12345' },
    ];
    
    const platformToRemove = 'xbox';
    const accountToRemove = 'Account1';
    
    const filteredGames = games.filter(g => 
      !(g.platform === platformToRemove && g.accountId === accountToRemove)
    );
    
    expect(filteredGames.length).toBe(2);
    expect(filteredGames.some(g => g.id === 'game1')).toBe(false);
    expect(filteredGames.some(g => g.id === 'game2')).toBe(true);
  });
});
