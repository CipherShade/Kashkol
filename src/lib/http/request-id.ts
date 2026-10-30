import { randomBytes } from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

function encodeTime(now: number): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
    throw new RangeError("ULID time must be a 48-bit non-negative integer");
  }

  let remaining = now;
  let output = "";
  for (let index = 0; index < TIME_LENGTH; index += 1) {
    output = ENCODING[remaining % 32] + output;
    remaining = Math.floor(remaining / 32);
  }
  return output;
}

function encodeRandom(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ENCODING[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += ENCODING[(value << (5 - bits)) & 31];
  }

  return output.slice(0, RANDOM_LENGTH);
}

/**
 * A ULID: 48-bit millisecond timestamp + 80 bits of randomness, Crockford
 * base32. Used for `requestId` (ARCHITECTURE.md RL-5) because it sorts by time.
 */
export function newRequestId(
  now: number = Date.now(),
  random: Uint8Array = randomBytes(10),
): string {
  if (random.byteLength < 10) {
    throw new RangeError("A ULID requires at least 10 random bytes");
  }
  const id = encodeTime(now) + encodeRandom(random);
  if (id.length !== 26) {
    throw new Error("Generated request id is not a ULID");
  }
  return id;
}

export function requestIdFromHeaders(headers: Headers): string {
  const existing = headers.get("x-request-id");
  return existing && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(existing) ? existing : newRequestId();
}

export const REQUEST_ID_HEADER = "x-request-id";
