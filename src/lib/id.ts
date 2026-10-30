import { randomBytes } from "node:crypto";

/**
 * A UUIDv7: 48 bits of Unix milliseconds followed by random bits.
 *
 * Time-ordered identifiers keep B-tree inserts local and are still not
 * guessable (the remaining 74 bits are random). This is an identifier
 * generator, not a security primitive.
 */
export function newUuidV7(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("newUuidV7 requires a non-negative integer timestamp");
  }
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  // Version 7.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // RFC 4122 variant.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}
