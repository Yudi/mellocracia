import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

const OPAQUE_TOKEN_BYTES = 32;
const OPAQUE_TOKEN_LENGTH = 43;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function createOpaqueToken(bytes = OPAQUE_TOKEN_BYTES): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 128) {
    throw new RangeError(
      'Opaque token byte length is outside the supported range',
    );
  }
  return randomBytes(bytes).toString('base64url');
}

export function isOpaqueToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === OPAQUE_TOKEN_LENGTH &&
    BASE64_URL_PATTERN.test(value)
  );
}

export function hashSecret(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

/** A Fisher-Yates shuffle backed by the OS CSPRNG, suitable for poll options. */
export function cryptographicallyShuffle<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export const OPAQUE_TOKEN_BYTE_LENGTH = OPAQUE_TOKEN_BYTES;
export const OPAQUE_TOKEN_CHAR_LENGTH = OPAQUE_TOKEN_LENGTH;
