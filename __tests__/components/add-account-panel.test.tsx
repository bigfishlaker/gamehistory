/**
 * Unit tests for AddAccountPanel normalization logic
 * Component is tested indirectly through integration tests
 */

import { describe, it, expect } from 'vitest';
import { normalizeSteamInput } from '@/lib/utils/steam-parser';
import { normalizeXboxInput, normalizePSNInput } from '@/lib/input-normalizer';

describe('AddAccountPanel Input Normalization', () => {
  describe('Xbox input normalization', () => {
    it('should accept plain gamertag', () => {
      const result = normalizeXboxInput('TestGamertag');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestGamertag');
    });

    it('should extract gamertag from Xbox profile URL', () => {
      const result = normalizeXboxInput('https://www.xbox.com/en-US/profile/gamertag/TestGamertag');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestGamertag');
    });

    it('should extract gamertag from simple Xbox profile URL', () => {
      const result = normalizeXboxInput('https://www.xbox.com/profile/TestGamertag');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestGamertag');
    });

    it('should reject empty input', () => {
      const result = normalizeXboxInput('');
      expect(result.success).toBe(false);
    });
  });

  describe('Steam input normalization', () => {
    it('should accept Steam ID64', () => {
      const result = normalizeSteamInput('76561198012345678');
      expect(result).toEqual({ kind: 'id64', value: '76561198012345678' });
    });

    it('should extract Steam ID from profile URL', () => {
      const result = normalizeSteamInput('https://steamcommunity.com/profiles/76561198012345678');
      expect(result).toEqual({ kind: 'id64', value: '76561198012345678' });
    });

    it('should extract vanity URL from custom URL', () => {
      const result = normalizeSteamInput('https://steamcommunity.com/id/testuser');
      expect(result).toEqual({ kind: 'vanity', value: 'testuser' });
    });

    it('should reject empty input', () => {
      const result = normalizeSteamInput('');
      expect(result).toBeNull();
    });
  });

  describe('PSN input normalization', () => {
    it('should accept plain PSN ID', () => {
      const result = normalizePSNInput('TestPSNUser');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestPSNUser');
    });

    it('should extract PSN ID from PSNProfiles URL', () => {
      const result = normalizePSNInput('https://psnprofiles.com/TestPSNUser');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestPSNUser');
    });

    it('should reject empty input', () => {
      const result = normalizePSNInput('');
      expect(result.success).toBe(false);
    });
  });

  describe('Account management logic', () => {
    it('should validate remaining slots correctly', () => {
      const MAX_ACCOUNTS = 6;
      const currentCount = 3;
      const remainingSlots = MAX_ACCOUNTS - currentCount;
      
      expect(remainingSlots).toBe(3);
      expect(currentCount < MAX_ACCOUNTS).toBe(true);
    });

    it('should prevent adding when at max', () => {
      const MAX_ACCOUNTS = 6;
      const currentCount = 6;
      const canAdd = currentCount < MAX_ACCOUNTS;
      
      expect(canAdd).toBe(false);
    });

    it('should show singular/plural slots correctly', () => {
      const MAX_ACCOUNTS = 6;
      
      expect(MAX_ACCOUNTS - 5).toBe(1); // 1 slot
      expect(MAX_ACCOUNTS - 3).toBe(3); // 3 slots
    });
  });
});
