/**
 * Student QR Identity Service.
 *
 * Provides persistent, cryptographically secure QR identity tokens for students.
 * Conforms to:
 *   - Phase 5: Student QR identity
 *   - Q4: Indefinite lifetime, persistent, explicit rotation, immediate invalidation
 *   - IN-6 (docs/INTEGRATIONS.md §9.2): Signed opaque payload, no personal info exposed
 */

import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type DbTransactionClient, withScope } from "@/lib/db/scope";
import { getServerEnv } from "@/lib/config/env";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  getStudentForQrTx,
  updateStudentQrHashTx,
} from "./repository";

const TOKEN_PREFIX = "kqr_v1";
const QR_IDENTITY_RANDOM_BYTES = 16;

/** Constant-time string comparison for signature and hash checks. */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function getSecret(): string {
  const env = getServerEnv();
  return env.BETTER_AUTH_SECRET;
}

/**
 * Construct a student QR token string.
 * Format: kqr_v1.<studentId>.<nonce>.<hmacSignature>
 */
export function buildStudentQrPayload(studentId: string, nonce: string): string {
  const secret = getSecret();
  const dataToSign = `${studentId}:${nonce}`;
  const signature = createHmac("sha256", secret).update(dataToSign).digest("base64url");
  return `${TOKEN_PREFIX}.${studentId}.${nonce}.${signature}`;
}

/**
 * Hash a full student QR token for storage/comparison.
 */
export function hashStudentQrToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Encode storage format in student.qr_token_hash:
 * `${nonce}:${sha256(token)}`
 */
function encodeStorage(nonce: string, token: string): string {
  return `${nonce}:${hashStudentQrToken(token)}`;
}

function parseStorage(storage: string | null | undefined): { nonce: string; hash: string } | null {
  if (!storage) return null;
  const idx = storage.indexOf(":");
  if (idx <= 0) return null;
  return {
    nonce: storage.slice(0, idx),
    hash: storage.slice(idx + 1),
  };
}

/**
 * Verify a scanned QR token against server signature.
 * Returns parsed { studentId, nonce } if signature is valid, or null if tampered.
 */
export function verifyStudentQrTokenSignature(token: string): { studentId: string; nonce: string } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 4) return null;
  const [prefix, studentId, nonce, providedSignature] = parts;
  if (prefix !== TOKEN_PREFIX || !studentId || !nonce || !providedSignature) return null;

  const secret = getSecret();
  const dataToSign = `${studentId}:${nonce}`;
  const expectedSignature = createHmac("sha256", secret).update(dataToSign).digest("base64url");

  if (!safeEqual(providedSignature, expectedSignature)) return null;
  return { studentId, nonce };
}

/**
 * Generate the persistent storage value (`nonce:sha256(token)`) for a newly
 * created student's QR identity. Callers persist the value themselves; the
 * raw token is never returned (it is shown to the teacher on the profile
 * screen after creation).
 */
export function generateStudentQrStorageValue(studentId: string): string {
  const nonce = randomBytes(QR_IDENTITY_RANDOM_BYTES).toString("base64url");
  const token = buildStudentQrPayload(studentId, nonce);
  return encodeStorage(nonce, token);
}

/**
 * Create the attendance QR identity inside an open transaction (e.g. the
 * student-creation transaction) so a new student never exists without one.
 */
export async function createStudentQrForTx(
  tx: DbTransactionClient,
  scope: Scope,
  studentId: string,
  reqCtx?: { requestId?: string; ipHash?: string | null },
): Promise<{ storageValue: string }> {
  const storageValue = generateStudentQrStorageValue(studentId);
  await updateStudentQrHashTx(tx, scope.workspaceId, studentId, storageValue);
  await writeAuditEvent(tx, {
    workspaceId: scope.workspaceId,
    actorUserId: scope.actorUserId,
    actorDisplayName: scope.actorDisplayName,
    actorType: "user",
    entityType: "student",
    entityId: studentId,
    action: "student.qr_generated",
    diff: { studentId, reason: "student_created" },
    requestId: reqCtx?.requestId ?? newRequestId(),
    ipHash: reqCtx?.ipHash,
  });
  return { storageValue };
}

/**
 * Get the current student QR token (creating one if none exists yet).
 * Returns the plaintext token for display/printing in the teacher app or portal.
 */
export async function getOrGenerateStudentQrToken(
  scope: Scope,
  studentId: string,
  reqCtx?: { requestId?: string; ipHash?: string | null },
): Promise<{ token: string; studentId: string }> {
  authorize(scope, "students", "read");

  return withScope(scope, async (tx) => {
    const student = await getStudentForQrTx(tx, scope.workspaceId, studentId);
    if (!student) throw new AppError("NOT_FOUND");

    const parsed = parseStorage(student.qrTokenHash);
    if (parsed) {
      // Re-create the persistent token
      const token = buildStudentQrPayload(student.id, parsed.nonce);
      return { token, studentId: student.id };
    }

    // Generate new persistent token
    const nonce = randomBytes(16).toString("base64url");
    const token = buildStudentQrPayload(student.id, nonce);
    const storageValue = encodeStorage(nonce, token);

    await updateStudentQrHashTx(tx, scope.workspaceId, student.id, storageValue);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: student.id,
      action: "student.qr_generated",
      diff: { studentId: student.id },
      requestId: reqCtx?.requestId ?? newRequestId(),
      ipHash: reqCtx?.ipHash,
    });

    return { token, studentId: student.id };
  });
}

/**
 * Explicitly rotate a student's QR token.
 * Generates a fresh nonce; invalidates the previous token immediately.
 */
export async function rotateStudentQrToken(
  scope: Scope,
  studentId: string,
  reqCtx?: { requestId?: string; ipHash?: string | null },
): Promise<{ token: string; studentId: string }> {
  authorize(scope, "students", "write");

  return withScope(scope, async (tx) => {
    const student = await getStudentForQrTx(tx, scope.workspaceId, studentId);
    if (!student) throw new AppError("NOT_FOUND");

    const nonce = randomBytes(16).toString("base64url");
    const token = buildStudentQrPayload(student.id, nonce);
    const storageValue = encodeStorage(nonce, token);

    await updateStudentQrHashTx(tx, scope.workspaceId, student.id, storageValue);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: student.id,
      action: "student.qr_rotated",
      diff: { studentId: student.id },
      requestId: reqCtx?.requestId ?? newRequestId(),
      ipHash: reqCtx?.ipHash,
    });

    return { token, studentId: student.id };
  });
}

/**
 * Revoke a student's QR token (sets hash to null).
 * Scans will be rejected until a new token is generated.
 */
export async function revokeStudentQrToken(
  scope: Scope,
  studentId: string,
  reqCtx?: { requestId?: string; ipHash?: string | null },
): Promise<{ success: true }> {
  authorize(scope, "students", "write");

  return withScope(scope, async (tx) => {
    const student = await getStudentForQrTx(tx, scope.workspaceId, studentId);
    if (!student) throw new AppError("NOT_FOUND");

    await updateStudentQrHashTx(tx, scope.workspaceId, student.id, null);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: student.id,
      action: "student.qr_revoked",
      diff: { studentId: student.id },
      requestId: reqCtx?.requestId ?? newRequestId(),
      ipHash: reqCtx?.ipHash,
    });

    return { success: true };
  });
}

/**
 * Helper to validate a student QR token against student record.
 * Returns true if valid, false otherwise.
 */
export function validateStudentQrAgainstRecord(
  token: string,
  studentQrTokenHash: string | null | undefined,
): boolean {
  if (!studentQrTokenHash) return false;
  const verified = verifyStudentQrTokenSignature(token);
  if (!verified) return false;

  const parsed = parseStorage(studentQrTokenHash);
  if (!parsed) return false;

  if (!safeEqual(parsed.nonce, verified.nonce)) return false;

  const computedHash = hashStudentQrToken(token);
  return safeEqual(computedHash, parsed.hash);
}
