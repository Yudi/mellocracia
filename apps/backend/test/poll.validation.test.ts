import { describe, expect, test } from 'bun:test';
import { getMaxPollEndDate } from '@mellocracia/contracts';
import {
  validatePollCreationInput,
  validateVoteOptionIds,
  validateVoterName,
} from '../src/app/polls/poll.validation';

describe('poll creation validation', () => {
  test('normalizes a valid title and accepts more than sixteen choices', () => {
    const ids = Array.from({ length: 20 }, (_, index) => `post-${index}`);
    const result = validatePollCreationInput('  Pick one  ', 1, ids, 1_000);
    expect(result.title).toBe('Pick one');
    expect(result.durationDays).toBe(1);
    expect(result.optionPostIds).toEqual(ids);
  });

  test('rejects duplicate choices and out-of-range durations', () => {
    expect(() =>
      validatePollCreationInput('Poll', 1, ['a', 'a'], 1_000),
    ).toThrow();
    expect(() =>
      validatePollCreationInput('Poll', 15, ['a', 'b'], 1_000),
    ).toThrow();
  });

  test('converts day presets to exact 24-hour periods across a daylight-saving change', () => {
    const now = new Date('2026-10-31T12:00:00-04:00');
    for (const days of [1, 3, 7, 14]) {
      const result = validatePollCreationInput(
        'Poll',
        days,
        ['a', 'b'],
        1_000,
        undefined,
        now,
      );
      expect(result.closesAt.getTime() - now.getTime()).toBe(days * 86_400_000);
    }
  });

  test('rejects fractional and zero-day preset durations', () => {
    for (const days of [0, -1, 0.5, 1.5]) {
      expect(() =>
        validatePollCreationInput('Poll', days, ['a', 'b'], 1_000),
      ).toThrow();
    }
  });

  test('accepts the fourteen-day maximum', () => {
    expect(
      validatePollCreationInput('Poll', 14, ['a', 'b'], 1_000).durationDays,
    ).toBe(14);
  });

  test('accepts exact future dates through the one-month boundary', () => {
    const now = new Date('2026-01-31T12:30:00.000Z');
    for (const end of [
      '2026-01-31T12:31:00.000Z',
      '2026-02-28T12:30:00.000Z',
    ]) {
      const result = validatePollCreationInput(
        'Poll',
        undefined,
        ['a', 'b'],
        1_000,
        end,
        now,
      );
      expect(result.closesAt.toISOString()).toBe(end);
    }
    expect(
      getMaxPollEndDate(new Date('2028-01-31T12:30:00.000Z')).toISOString(),
    ).toBe('2028-02-29T12:30:00.000Z');
    expect(
      getMaxPollEndDate(new Date('2026-12-31T12:30:00.000Z')).toISOString(),
    ).toBe('2027-01-31T12:30:00.000Z');
  });

  test('rejects past, current, invalid, and more-than-one-month dates', () => {
    const now = new Date('2026-01-31T12:30:00.000Z');
    for (const end of [
      '2026-01-31T12:29:00.000Z',
      now.toISOString(),
      '2026-02-28T12:30:00.001Z',
      'invalid',
      '',
      null,
      123,
    ]) {
      expect(() =>
        validatePollCreationInput(
          'Poll',
          undefined,
          ['a', 'b'],
          1_000,
          end,
          now,
        ),
      ).toThrow();
    }
    expect(() =>
      validatePollCreationInput('Poll', undefined, ['a', 'b'], 1_000),
    ).toThrow();
    expect(() =>
      validatePollCreationInput(
        'Poll',
        1,
        ['a', 'b'],
        1_000,
        '2026-02-01T12:30:00.000Z',
        now,
      ),
    ).toThrow();
  });

  test('enforces the configured maximum rather than a hard-coded sixteen', () => {
    expect(() =>
      validatePollCreationInput('Poll', 1, ['a', 'b', 'c'], 2),
    ).toThrow();
  });

  test('accepts several distinct options in one ballot', () => {
    expect(validateVoteOptionIds(['post-a', 'post-b'], 1_000)).toEqual([
      'post-a',
      'post-b',
    ]);
  });

  test('rejects empty, duplicate, and oversized ballot selections', () => {
    expect(() => validateVoteOptionIds([], 1_000)).toThrow();
    expect(() => validateVoteOptionIds(['post-a', 'post-a'], 1_000)).toThrow();
    expect(() => validateVoteOptionIds(['post-a', 'post-b'], 1)).toThrow();
  });
});

describe('voter name validation', () => {
  test('trims names and allows absent names only when optional', () => {
    expect(validateVoterName('  João Silva  ', true)).toBe('João Silva');
    expect(validateVoterName(undefined, false)).toBeNull();
    expect(validateVoterName('  ', false)).toBeNull();
    expect(() => validateVoterName(undefined, true)).toThrow();
    expect(() => validateVoterName(' \t ', true)).toThrow();
  });

  test('rejects non-string and oversized names', () => {
    for (const value of [null, 123, {}, 'a'.repeat(121)]) {
      expect(() => validateVoterName(value, false)).toThrow();
    }
    expect(validateVoterName('a'.repeat(120), true)).toHaveLength(120);
  });
});
