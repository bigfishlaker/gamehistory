import { describe, it, expect } from 'vitest';
import { describeAccountError, describeAccountErrors, parseErrorKey } from '../lib/account-errors';
import { BUSY_MESSAGE } from '../lib/rate-limit';

describe('friendly account errors', () => {
  it('parses API error keys', () => {
    expect(parseErrorKey('steam-76561197960287930')).toEqual({ platform: 'steam', account: '76561197960287930', part: null });
    expect(parseErrorKey('xbox-Major Nelson-playtime')).toEqual({ platform: 'xbox', account: 'Major Nelson', part: 'playtime' });
    expect(parseErrorKey('psn-some-name-games')).toEqual({ platform: 'psn', account: 'some-name', part: 'games' });
  });

  it('explains a private Steam profile with steps to make it public', () => {
    const e = describeAccountError('steam-76561197960287930', 'This Steam profile is not public. Change "Game details" to "Public" in Privacy Settings.');
    expect(e.kind).toBe('private');
    expect(e.title).toBe('This Steam profile is private');
    expect(e.steps?.join(' ')).toMatch(/Edit Profile.*Privacy Settings.*Game details.*Public/);
  });

  it('handles gamertag not found, Xbox busy and PSN unavailable', () => {
    expect(describeAccountError('xbox-nobodyhere1', 'Gamertag "nobodyhere1" not found')).toMatchObject({ kind: 'not-found', title: 'Gamertag not found' });
    expect(describeAccountError('xbox-Stallion83', BUSY_MESSAGE)).toMatchObject({ kind: 'busy', title: 'Xbox is busy right now, showing your other platforms' });
    expect(describeAccountError('psn-someone', 'PSN authentication failed. NPSSO token may be invalid or expired.')).toMatchObject({ kind: 'unavailable', title: 'PlayStation is unavailable right now' });
    expect(describeAccountError('psn-someone', 'PSN user "someone" not found')).toMatchObject({ kind: 'not-found', title: 'PSN Online ID not found' });
  });

  it('never throws on odd input', () => {
    expect(describeAccountErrors(undefined)).toEqual([]);
    expect(describeAccountErrors({ weird: '' })[0]).toMatchObject({ platform: null, kind: 'other' });
  });
});
