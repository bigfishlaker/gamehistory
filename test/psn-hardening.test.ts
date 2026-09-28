import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('psn-api', () => ({
  exchangeNpssoForAccessCode: vi.fn(),
  exchangeAccessCodeForAuthTokens: vi.fn(),
  exchangeRefreshTokenForAuthTokens: vi.fn(),
  makeUniversalSearch: vi.fn(),
  getProfileFromUserName: vi.fn(),
  getUserTitles: vi.fn(),
  getUserPlayedGames: vi.fn(),
  getTitleTrophies: vi.fn(),
  getUserTrophiesEarnedForTitle: vi.fn(),
}));

import { exchangeNpssoForAccessCode, exchangeAccessCodeForAuthTokens, makeUniversalSearch } from 'psn-api';
import { PSNAdapter, PSN_UNAVAILABLE_MESSAGE, PSN_AUTH_FAILURE_TTL_SECONDS } from '../lib/adapters/psn-adapter';
import { reserveUpstream, UPSTREAM_HOURLY_LIMITS, PSN_BUSY_MESSAGE } from '../lib/rate-limit';
import { describeAccountError } from '../lib/account-errors';

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('5. PSN auth failure', () => {
  it('shows a neutral message, logs the real reason, and pauses Sign-in retries for ~10 minutes', async () => {
    vi.mocked(exchangeNpssoForAccessCode).mockRejectedValue(new Error('npsso expired (401)'));
    const adapter = new PSNAdapter('expired-npsso-' + Math.random());

    const r1 = await adapter.resolvePlayer('SomePlayer');
    expect(r1.success).toBe(false);
    if (!r1.success) {
      expect(r1.error.message).toBe(PSN_UNAVAILABLE_MESSAGE);
      expect(r1.error.message).toBe('PlayStation lookups are temporarily unavailable. Please try again later.');
    }
    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0][0])).toMatch(/NPSSO/);
    expect(String(errSpy.mock.calls[0][1])).toContain('npsso expired (401)');

    const r2 = await adapter.getGameLibrary('123');
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.error.message).toBe(PSN_UNAVAILABLE_MESSAGE);
    expect(exchangeNpssoForAccessCode).toHaveBeenCalledTimes(1); // cached failure, Sony not retried
    expect(PSN_AUTH_FAILURE_TTL_SECONDS).toBe(600);

    expect(describeAccountError('psn-SomePlayer', PSN_UNAVAILABLE_MESSAGE)).toMatchObject({ kind: 'unavailable' });
  });

  it('retries sign-in after the failure cache expires', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(exchangeNpssoForAccessCode).mockRejectedValue(new Error('bad'));
      const adapter = new PSNAdapter('expired-npsso-b-' + Math.random());
      await adapter.resolvePlayer('A');
      vi.advanceTimersByTime((PSN_AUTH_FAILURE_TTL_SECONDS + 1) * 1000);
      await adapter.resolvePlayer('A');
      expect(exchangeNpssoForAccessCode).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns BUDGET_EXHAUSTED without calling Sony once the hourly PSN budget is used up', async () => {
    vi.mocked(exchangeNpssoForAccessCode).mockResolvedValue('code');
    vi.mocked(exchangeAccessCodeForAuthTokens).mockResolvedValue({
      accessToken: 'a', refreshToken: 'r', expiresIn: 3600, tokenType: 'Bearer', scope: '', idToken: '', refreshTokenExpiresIn: 0,
    });
    await reserveUpstream('psn', UPSTREAM_HOURLY_LIMITS.psn);
    const r = await new PSNAdapter('fresh-npsso-' + Math.random()).resolvePlayer('SomePlayer');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.code).toBe('BUDGET_EXHAUSTED');
      expect(r.error.message).toBe(PSN_BUSY_MESSAGE);
    }
    expect(makeUniversalSearch).not.toHaveBeenCalled();
    expect(exchangeNpssoForAccessCode).not.toHaveBeenCalled();
  });
});
