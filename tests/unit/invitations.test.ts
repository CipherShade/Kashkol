import { describe, expect, it } from "vitest";
import {
  canResendInvitation,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationState,
  normalizeInvitationEmail,
} from "@/modules/tenancy/invitations";

describe("assistant invitation lifecycle helpers", () => {
  it("uses a high-entropy URL-safe token and stores a one-way digest", () => {
    const token = createInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).not.toBe(token);
    expect(createInvitationToken()).not.toBe(token);
  });

  it("expires invitations after seven days and derives expiry from the clock", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    const expiresAt = invitationExpiry(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(invitationState({ status: "pending", expiresAt }, now)).toBe("pending");
    expect(invitationState({ status: "pending", expiresAt }, expiresAt)).toBe("expired");
  });

  it("normalizes the invited email and enforces the resend cooldown", () => {
    const sentAt = new Date("2026-10-30T12:00:00.000Z");
    expect(normalizeInvitationEmail("  Teacher@Example.COM ")).toBe("teacher@example.com");
    expect(canResendInvitation(sentAt, new Date(sentAt.getTime() + 59_999))).toBe(false);
    expect(canResendInvitation(sentAt, new Date(sentAt.getTime() + 60_000))).toBe(true);
  });
});
