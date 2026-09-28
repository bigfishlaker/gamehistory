import { describe, it, expect } from 'vitest';
import { parseSteamIdentifier, isSteamId64, normalizeSteamInput } from '../lib/utils/steam-parser';

describe('Steam Parser', () => {
  describe('parseSteamIdentifier', () => {
    it('should return Steam ID if already an ID', () => {
      const id = '76561199851755493';
      expect(parseSteamIdentifier(id)).toBe(id);
    });

    it('should extract ID from profile URL', () => {
      const url = 'https://steamcommunity.com/profiles/76561199851755493';
      expect(parseSteamIdentifier(url)).toBe('76561199851755493');
    });

    it('should extract custom URL', () => {
      const url = 'https://steamcommunity.com/id/username';
      expect(parseSteamIdentifier(url)).toBe('username');
    });

    it('should handle URL with trailing slash', () => {
      const url = 'https://steamcommunity.com/profiles/76561199851755493/';
      expect(parseSteamIdentifier(url)).toBe('76561199851755493');
    });

    it('should trim whitespace', () => {
      const id = '  76561199851755493  ';
      expect(parseSteamIdentifier(id)).toBe('76561199851755493');
    });
  });

  describe('isSteamId64', () => {
    it('should return true for valid Steam ID', () => {
      expect(isSteamId64('76561199851755493')).toBe(true);
    });

    it('should return false for invalid Steam ID', () => {
      expect(isSteamId64('invalid')).toBe(false);
      expect(isSteamId64('12345')).toBe(false);
      expect(isSteamId64('abcdefghijklmnopq')).toBe(false);
    });
  });

  describe('normalizeSteamInput', () => {
    const ID = '76561199841807403';

    it('accepts a bare 17-digit SteamID64', () => {
      expect(normalizeSteamInput(ID)).toEqual({ kind: 'id64', value: ID });
      expect(normalizeSteamInput(`  ${ID}\n`)).toEqual({ kind: 'id64', value: ID });
    });

    it.each([
      `https://steamcommunity.com/profiles/${ID}/`,
      `https://steamcommunity.com/profiles/${ID}`,
      `http://www.steamcommunity.com/profiles/${ID}`,
      `www.steamcommunity.com/profiles/${ID}/`,
      `steamcommunity.com/profiles/${ID}`,
      `https://steamcommunity.com/profiles/${ID}/games/?tab=all`,
      `https://steamcommunity.com/profiles/${ID}#top`,
      `HTTPS://SteamCommunity.com/Profiles/${ID}/`,
    ])('extracts the ID64 from profile URL %s', (url) => {
      expect(normalizeSteamInput(url)).toEqual({ kind: 'id64', value: ID });
    });

    it.each([
      'https://steamcommunity.com/id/gabelogannewell',
      'https://steamcommunity.com/id/gabelogannewell/',
      'steamcommunity.com/id/gabelogannewell',
      'www.steamcommunity.com/id/gabelogannewell/games?tab=all',
    ])('extracts the vanity name from %s', (url) => {
      expect(normalizeSteamInput(url)).toEqual({ kind: 'vanity', value: 'gabelogannewell' });
    });

    it('accepts a bare vanity name', () => {
      expect(normalizeSteamInput('gabelogannewell')).toEqual({ kind: 'vanity', value: 'gabelogannewell' });
      expect(normalizeSteamInput('my_name-1')).toEqual({ kind: 'vanity', value: 'my_name-1' });
    });

    it.each([
      '',
      '   ',
      'https://steamcommunity.com/profiles/12345/',
      'https://steamcommunity.com/profiles/notanid/',
      'https://steamcommunity.com/',
      'https://example.com/profiles/76561199841807403',
      'https://steamcommunity.com.evil.example/profiles/76561199841807403',
      'has spaces',
      'a',
      'x'.repeat(33),
    ])('rejects invalid input %j', (input) => {
      expect(normalizeSteamInput(input)).toBeNull();
    });
  });
});
