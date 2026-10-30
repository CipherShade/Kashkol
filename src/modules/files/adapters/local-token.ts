import { createHmac, timingSafeEqual } from "node:crypto";
import { assertSafeStorageKey } from "./key";

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createLocalDownloadToken(
  key: string,
  expiresAtSeconds: number,
  secret: string,
): string {
  assertSafeStorageKey(key);
  const payload = `${Buffer.from(key).toString("base64url")}.${expiresAtSeconds}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyLocalDownloadToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedKey, rawExpiry, suppliedSignature] = parts;
  if (!/^\d+$/.test(rawExpiry)) return null;
  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) return null;

  const payload = `${encodedKey}.${rawExpiry}`;
  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const key = Buffer.from(encodedKey, "base64url").toString("utf8");
    assertSafeStorageKey(key);
    return key;
  } catch {
    return null;
  }
}
