import { describe, expect, test } from 'bun:test';
import {
  validatePollCreationInput,
  validateVoteOptionIds,
} from '../src/app/polls/poll.validation';

describe('poll creation validation', () => {
  test('normalizes a valid title and accepts more than sixteen choices', () => {
    const ids = Array.from({ length: 20 }, (_, index) => `post-${index}`);
    const result = validatePollCreationInput('  Pick one  ', 24, ids, 1_000);
    expect(result.title).toBe('Pick one');
    expect(result.durationHours).toBe(24);
    expect(result.optionPostIds).toEqual(ids);
  });

  test('rejects duplicate choices and out-of-range durations', () => {
    expect(() =>
      validatePollCreationInput('Poll', 1, ['a', 'a'], 1_000),
    ).toThrow();
    expect(() =>
      validatePollCreationInput('Poll', 337, ['a', 'b'], 1_000),
    ).toThrow();
  });

  test('accepts the fourteen-day maximum', () => {
    expect(
      validatePollCreationInput('Poll', 336, ['a', 'b'], 1_000).durationHours,
    ).toBe(336);
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
