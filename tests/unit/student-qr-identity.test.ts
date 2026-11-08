import { describe, it, expect, vi } from "vitest";
import {
  buildStudentQrPayload,
  verifyStudentQrTokenSignature,
  hashStudentQrToken,
} from "../../src/modules/attendance/student-qr.js";

// Mock getServerEnv
vi.mock("@/lib/config/env", () => ({
  getServerEnv: () => ({
    BETTER_AUTH_SECRET: "test-secret-32-chars-long-minimum-entropy!!",
  }),
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
