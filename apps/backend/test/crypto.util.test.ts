import { describe, expect, test } from 'bun:test';
import {
  createOpaqueToken,
  cryptographicallyShuffle,
  hashSecret,
  isOpaqueToken,
} from '../src/app/security/crypto.util';

describe('crypto utilities', () => {
  test('creates opaque 32-byte base64url tokens', () => {
    const token = createOpaqueToken();
    expect(token).toHaveLength(43);
    expect(isOpaqueToken(token)).toBe(true);
    expect(isOpaqueToken(`${token}x`)).toBe(false);
  });

  test('hashes the same token deterministically without storing it', () => {
    const token = createOpaqueToken();
    expect(hashSecret(token, 'test-secret')).toBe(
      hashSecret(token, 'test-secret'),
    );
    expect(hashSecret(token, 'test-secret')).not.toBe(token);
  });

  test('shuffles without dropping or duplicating options', () => {
    const source = ['a', 'b', 'c', 'd'];
    expect(cryptographicallyShuffle(source).sort()).toEqual(source);
    expect(source).toEqual(['a', 'b', 'c', 'd']);
  });
});
