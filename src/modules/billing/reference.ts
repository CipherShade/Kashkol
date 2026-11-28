import crypto from "node:crypto";

/**
 * Conservative reference normalization. Uniqueness is checked on this
 * fingerprint, never on free-form user text. The exact bank-side rules remain
 * an open product decision, so no characters are invented or inferred.
 */
export function normalizeTransactionReference(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function transactionReferenceFingerprint(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
