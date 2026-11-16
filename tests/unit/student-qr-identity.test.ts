import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildStudentQrPayload,
  verifyStudentQrTokenSignature,
  hashStudentQrToken,
  getStudentQrToken,
  rotateStudentQrToken,
  revokeStudentQrToken,
} from "../../src/modules/attendance/student-qr.js";
import type { Scope } from "../../src/modules/tenancy/types.js";

// Mock getServerEnv
vi.mock("@/lib/config/env", () => ({
  getServerEnv: () => ({
    BETTER_AUTH_SECRET: "test-secret-32-chars-long-minimum-entropy!!",
  }),
}));

const fakeTx = {};
const getStudentForQrTxMock = vi.fn();
const updateStudentQrHashTxMock = vi.fn();
const writeAuditEventMock = vi.fn();

vi.mock("@/lib/db/scope", () => ({
  withScope: vi.fn(async (_scope: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx)),
}));

vi.mock("@/modules/audit/service", () => ({
  writeAuditEvent: (...args: unknown[]) => writeAuditEventMock(...args),
}));

vi.mock("@/modules/attendance/repository", () => ({
  getStudentForQrTx: (...args: unknown[]) => getStudentForQrTxMock(...args),
  updateStudentQrHashTx: (...args: unknown[]) => updateStudentQrHashTxMock(...args),
}));

describe("Student QR Identity", () => {
  const studentId = "018f6c5b-4321-789a-bcde-ef0123456789";
  const nonce = "test-nonce-1234";

  it("builds a valid signed student QR token", () => {
    const payload = buildStudentQrPayload(studentId, nonce);
    expect(payload).toMatch(/^kqr_v1\.[^.]+\.[^.]+\.[^.]+$/);
  });

  it("verifies a valid student QR token", () => {
    const payload = buildStudentQrPayload(studentId, nonce);
    const verified = verifyStudentQrTokenSignature(payload);
    expect(verified).not.toBeNull();
    expect(verified?.studentId).toBe(studentId);
    expect(verified?.nonce).toBe(nonce);
  });

  it("rejects a tampered studentId in the QR token", () => {
    const payload = buildStudentQrPayload(studentId, nonce);
    const parts = payload.split(".");
    // Change the studentId part
    parts[1] = "018f6c5b-9999-789a-bcde-ef0123456789";
    const tampered = parts.join(".");
    expect(verifyStudentQrTokenSignature(tampered)).toBeNull();
  });

  it("rejects a tampered nonce in the QR token", () => {
    const payload = buildStudentQrPayload(studentId, nonce);
    const parts = payload.split(".");
    parts[2] = "evil-nonce";
    const tampered = parts.join(".");
    expect(verifyStudentQrTokenSignature(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const payload = buildStudentQrPayload(studentId, nonce);
    const parts = payload.split(".");
    parts[3] = "invalidSignatureX==";
    const tampered = parts.join(".");
    expect(verifyStudentQrTokenSignature(tampered)).toBeNull();
  });

  it("rejects malformed token strings", () => {
    expect(verifyStudentQrTokenSignature("not-a-token")).toBeNull();
    expect(verifyStudentQrTokenSignature("")).toBeNull();
    expect(verifyStudentQrTokenSignature("kqr_v1.only.two.parts.extra")).toBeNull();
    expect(verifyStudentQrTokenSignature("wrong_prefix.id.nonce.sig")).toBeNull();
  });

  it("hashes tokens deterministically with SHA-256", () => {
    const token = buildStudentQrPayload(studentId, nonce);
    const hash1 = hashStudentQrToken(token);
    const hash2 = hashStudentQrToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  it("different nonces produce completely different tokens and hashes (rotation guarantees)", () => {
    const tokenA = buildStudentQrPayload(studentId, "nonce-A");
    const tokenB = buildStudentQrPayload(studentId, "nonce-B");
    expect(tokenA).not.toBe(tokenB);
    expect(hashStudentQrToken(tokenA)).not.toBe(hashStudentQrToken(tokenB));
  });

  it("does not leak student name or sensitive data in the token string", () => {
    const token = buildStudentQrPayload(studentId, nonce);
    // Student name, phone, etc. are NOT in the token
    expect(token).not.toContain("Ahmed");
    expect(token).not.toContain("010");
  });
});

describe("Student QR Lifecycle and Durable Revocation", () => {
  const studentId = "018f6c5b-4321-789a-bcde-ef0123456789";
  const nonce = "test-nonce-1234";
  const scope: Scope = {
    workspaceId: "018f6c5b-0000-7000-8000-000000000001",
    actorUserId: "018f6c5b-0000-7000-8000-000000000002",
    actorDisplayName: "Teacher Ali",
    role: "owner",
    permissions: new Set(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getStudentQrToken returns { status: 'disabled' } when qrTokenHash is null (revoked)", async () => {
    getStudentForQrTxMock.mockResolvedValueOnce({
      id: studentId,
      workspaceId: scope.workspaceId,
      qrTokenHash: null,
    });

    const res = await getStudentQrToken(scope, studentId);
    expect(res).toEqual({ status: "disabled", studentId });
    // Revocation is durable: reading the token MUST NOT silently regenerate or write a new hash
    expect(updateStudentQrHashTxMock).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("getStudentQrToken returns { status: 'disabled' } when qrTokenHash is corrupted or invalid", async () => {
    getStudentForQrTxMock.mockResolvedValueOnce({
      id: studentId,
      workspaceId: scope.workspaceId,
      qrTokenHash: "invalid_without_colon",
    });

    const res = await getStudentQrToken(scope, studentId);
    expect(res).toEqual({ status: "disabled", studentId });
    expect(updateStudentQrHashTxMock).not.toHaveBeenCalled();
  });

  it("getStudentQrToken returns { status: 'active', token, studentId } when token is valid", async () => {
    const payload = buildStudentQrPayload(studentId, nonce);
    const hash = hashStudentQrToken(payload);
    getStudentForQrTxMock.mockResolvedValueOnce({
      id: studentId,
      workspaceId: scope.workspaceId,
      qrTokenHash: `${nonce}:${hash}`,
    });

    const res = await getStudentQrToken(scope, studentId);
    expect(res).toEqual({ status: "active", token: payload, studentId });
    expect(updateStudentQrHashTxMock).not.toHaveBeenCalled();
  });

  it("revokeStudentQrToken sets qrTokenHash to null and returns disabled status", async () => {
    getStudentForQrTxMock.mockResolvedValueOnce({
      id: studentId,
      workspaceId: scope.workspaceId,
      qrTokenHash: "active-nonce:active-hash",
    });

    const res = await revokeStudentQrToken(scope, studentId);
    expect(res).toEqual({ success: true, status: "disabled" });
    expect(updateStudentQrHashTxMock).toHaveBeenCalledWith(
      fakeTx,
      scope.workspaceId,
      studentId,
      null,
    );
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        workspaceId: scope.workspaceId,
        action: "student.qr_revoked",
        entityId: studentId,
      }),
    );
  });

  it("rotateStudentQrToken issues a new active token and updates the hash", async () => {
    getStudentForQrTxMock.mockResolvedValueOnce({
      id: studentId,
      workspaceId: scope.workspaceId,
      qrTokenHash: null,
    });

    const res = await rotateStudentQrToken(scope, studentId);
    expect(res.status).toBe("active");
    expect(res.studentId).toBe(studentId);
    expect(res.token).toMatch(/^kqr_v1\./);
    expect(updateStudentQrHashTxMock).toHaveBeenCalledWith(
      fakeTx,
      scope.workspaceId,
      studentId,
      expect.stringContaining(":"),
    );
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        workspaceId: scope.workspaceId,
        action: "student.qr_rotated",
        entityId: studentId,
      }),
    );
  });
});
