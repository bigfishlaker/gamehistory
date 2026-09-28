import { describe, it, expect } from 'vitest';
import { userSafeError, GENERIC_UPSTREAM_ERROR } from '../lib/utils/safe-error';

describe('userSafeError', () => {
  it('hides raw upstream JSON (the OpenXBL VALIDATION_ERROR body)', () => {
    expect(userSafeError('{"code":"VALIDATION_ERROR","message":"Invalid request parameters"}')).toBe(GENERIC_UPSTREAM_ERROR);
    expect(userSafeError('Playtime unavailable: {"code":"VALIDATION_ERROR"}')).toBe(GENERIC_UPSTREAM_ERROR);
  });
  it('hides HTML error pages and uses the fallback when given', () => {
    expect(userSafeError('<html><body>502 Bad Gateway</body></html>', 'Xbox Live request failed.')).toBe('Xbox Live request failed.');
  });
  it('unwraps a JSON array of plain strings into a sentence', () => {
    expect(userSafeError('["Request contains Accept-Language header with invalid locale value: *"]'))
      .toBe('Request contains Accept-Language header with invalid locale value: *');
  });
  it('keeps plain friendly sentences', () => {
    expect(userSafeError('This PSN profile is private')).toBe('This PSN profile is private');
    expect(userSafeError(undefined)).toBe(GENERIC_UPSTREAM_ERROR);
  });
});

import { toHttps } from '../lib/adapters/psn-adapter';
describe('PSN avatar URLs', () => {
  it('are upgraded to https (CSP img-src https:)', () => {
    expect(toHttps('http://static-resource.np.community.playstation.net/avatar/WWS_A/x.png')).toBe('https://static-resource.np.community.playstation.net/avatar/WWS_A/x.png');
    expect(toHttps(undefined)).toBeUndefined();
  });
});
