import { describe, it, expect } from 'vitest';
import {
  normalizeSteamInput,
  normalizeXboxInput,
  normalizePSNInput,
} from '../lib/input-normalizer';

describe('Steam Input Normalization', () => {
  describe('Valid 17-digit SteamID64', () => {
    it('should accept raw SteamID64', () => {
      const result = normalizeSteamInput('76561199851755493');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
      expect(result.needsResolution).toBeUndefined();
    });

    it('should accept SteamID64 with whitespace', () => {
      const result = normalizeSteamInput('  76561199851755493  ');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });
  });

  describe('Profile URLs with SteamID64', () => {
    it('should extract from https://steamcommunity.com/profiles/ID', () => {
      const result = normalizeSteamInput('https://steamcommunity.com/profiles/76561199851755493');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });

    it('should extract from http://steamcommunity.com/profiles/ID', () => {
      const result = normalizeSteamInput('http://steamcommunity.com/profiles/76561199851755493');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });

    it('should extract from www.steamcommunity.com/profiles/ID', () => {
      const result = normalizeSteamInput('https://www.steamcommunity.com/profiles/76561199851755493');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });

    it('should handle trailing slash', () => {
      const result = normalizeSteamInput('https://steamcommunity.com/profiles/76561199851755493/');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });

    it('should handle trailing path', () => {
      const result = normalizeSteamInput('https://steamcommunity.com/profiles/76561199851755493/games');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });

    it('should handle query parameters', () => {
      const result = normalizeSteamInput('https://steamcommunity.com/profiles/76561199851755493?tab=games');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });

    it('should handle URL without protocol', () => {
      const result = normalizeSteamInput('steamcommunity.com/profiles/76561199851755493');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('76561199851755493');
    });
  });

  describe('Vanity URLs', () => {
    it('should detect https://steamcommunity.com/id/username', () => {
      const result = normalizeSteamInput('https://steamcommunity.com/id/gabelogannewell');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('gabelogannewell');
      expect(result.needsResolution).toBe(true);
    });

    it('should detect vanity URL without protocol', () => {
      const result = normalizeSteamInput('steamcommunity.com/id/username123');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('username123');
      expect(result.needsResolution).toBe(true);
    });

    it('should detect bare username', () => {
      const result = normalizeSteamInput('myusername');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('myusername');
      expect(result.needsResolution).toBe(true);
    });

    it('should accept username with dashes and underscores', () => {
      const result = normalizeSteamInput('user_name-123');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('user_name-123');
      expect(result.needsResolution).toBe(true);
    });

    it('should reject vanity name that is too short', () => {
      const result = normalizeSteamInput('ab');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Steam ID format');
    });

    it('should reject vanity name that is too long', () => {
      const result = normalizeSteamInput('a'.repeat(33));
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Invalid inputs', () => {
    it('should reject empty string', () => {
      const result = normalizeSteamInput('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject invalid URL domain', () => {
      const result = normalizeSteamInput('https://example.com/profile/123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Steam profile URL');
    });

    it('should reject SteamID with wrong length', () => {
      const result = normalizeSteamInput('12345');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid SteamID64');
    });
  });
});

describe('Xbox Input Normalization', () => {
  describe('Valid gamertags', () => {
    it('should accept raw gamertag', () => {
      const result = normalizeXboxInput('MajorNelson');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('MajorNelson');
    });

    it('should accept gamertag with spaces', () => {
      const result = normalizeXboxInput('Major Nelson');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('Major Nelson');
    });

    it('should accept gamertag with numbers', () => {
      const result = normalizeXboxInput('Player123');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('Player123');
    });

    it('should trim whitespace', () => {
      const result = normalizeXboxInput('  Gamer  ');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('Gamer');
    });
  });

  describe('Xbox.com URLs', () => {
    it('should extract from xbox.com profile URL', () => {
      const result = normalizeXboxInput('https://www.xbox.com/en-us/profile/gamertag/MajorNelson');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('MajorNelson');
    });

    it('should handle simple xbox.com/profile format', () => {
      const result = normalizeXboxInput('https://xbox.com/profile/TestGamer');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestGamer');
    });

    it('should handle URL without protocol', () => {
      const result = normalizeXboxInput('xbox.com/en-us/profile/gamertag/Player');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('Player');
    });

    it('should handle URL-encoded gamertags', () => {
      const result = normalizeXboxInput('https://xbox.com/profile/Test%20Gamer');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('Test Gamer');
    });
  });

  describe('XboxGamertag.com URLs', () => {
    it('should extract from xboxgamertag.com', () => {
      const result = normalizeXboxInput('https://xboxgamertag.com/search/TestPlayer');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestPlayer');
    });

    it('should handle URL without protocol', () => {
      const result = normalizeXboxInput('xboxgamertag.com/search/Gamer123');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('Gamer123');
    });
  });

  describe('Invalid inputs', () => {
    it('should reject empty string', () => {
      const result = normalizeXboxInput('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject gamertag that is too long', () => {
      const result = normalizeXboxInput('a'.repeat(16));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Xbox gamertag format');
    });

    it('should reject invalid URL domain', () => {
      const result = normalizeXboxInput('https://example.com/profile/test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Xbox profile URL');
    });

    it('should reject gamertag with special characters', () => {
      const result = normalizeXboxInput('Test@User');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Xbox gamertag format');
    });
  });
});

describe('PSN Input Normalization', () => {
  describe('Valid PSN IDs', () => {
    it('should accept raw PSN ID', () => {
      const result = normalizePSNInput('PlayStation');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('PlayStation');
    });

    it('should accept PSN ID with underscores', () => {
      const result = normalizePSNInput('test_user');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('test_user');
    });

    it('should accept PSN ID with dashes', () => {
      const result = normalizePSNInput('test-user-123');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('test-user-123');
    });

    it('should trim whitespace', () => {
      const result = normalizePSNInput('  testuser  ');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('testuser');
    });
  });

  describe('PSNProfiles URLs', () => {
    it('should extract from https://psnprofiles.com/username', () => {
      const result = normalizePSNInput('https://psnprofiles.com/PlayStation');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('PlayStation');
    });

    it('should handle URL without protocol', () => {
      const result = normalizePSNInput('psnprofiles.com/testuser');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('testuser');
    });

    it('should handle trailing slash', () => {
      const result = normalizePSNInput('https://psnprofiles.com/username/');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('username');
    });

    it('should handle URL-encoded IDs', () => {
      const result = normalizePSNInput('https://psnprofiles.com/test_user');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('test_user');
    });
  });

  describe('PlayStation.com URLs', () => {
    it('should extract from my.playstation.com', () => {
      const result = normalizePSNInput('https://my.playstation.com/profile/TestUser');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('TestUser');
    });

    it('should handle URL without protocol', () => {
      const result = normalizePSNInput('my.playstation.com/profile/gamer123');
      expect(result.success).toBe(true);
      expect(result.identifier).toBe('gamer123');
    });
  });

  describe('Invalid inputs', () => {
    it('should reject empty string', () => {
      const result = normalizePSNInput('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject PSN ID that is too short', () => {
      const result = normalizePSNInput('ab');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid PSN ID format');
    });

    it('should reject PSN ID that is too long', () => {
      const result = normalizePSNInput('a'.repeat(17));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid PSN ID format');
    });

    it('should reject invalid URL domain', () => {
      const result = normalizePSNInput('https://example.com/profile/test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid PSN profile URL');
    });

    it('should reject PSN ID with spaces', () => {
      const result = normalizePSNInput('test user');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid PSN ID format');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle Steam URL that is actually just a long number', () => {
    const result = normalizeSteamInput('76561199851755493123'); // 20 digits
    expect(result.success).toBe(false);
  });

  it('should handle Xbox gamertag at exactly 15 characters', () => {
    const result = normalizeXboxInput('a'.repeat(15));
    expect(result.success).toBe(true);
  });

  it('should handle PSN ID at exactly 16 characters', () => {
    const result = normalizePSNInput('a'.repeat(16));
    expect(result.success).toBe(true);
  });

  it('should handle PSN ID at exactly 3 characters', () => {
    const result = normalizePSNInput('abc');
    expect(result.success).toBe(true);
  });
});
