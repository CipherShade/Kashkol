import { describe, expect, it } from "vitest";
import {
  evaluateSessionPolicy,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
} from "@/lib/auth/session-policy";

const now = new Date("2026-10-24T12:00:00.000Z");

function ago(ms: number): Date {
  return new Date(now.getTime() - ms);
}

describe("session policy", () => {
  it("accepts an active session inside both windows", () => {
    expect(
      evaluateSessionPolicy({
        createdAt: ago(24 * 60 * 60 * 1000),
        lastSeenAt: ago(5 * 60 * 1000),
        now,
      }),
    ).toEqual({ valid: true });
  });

  it("expires a session idle for twelve hours", () => {
    expect(
      evaluateSessionPolicy({
        createdAt: ago(30 * 24 * 60 * 60 * 1000),
        lastSeenAt: ago(SESSION_IDLE_MS),
        now,
      }),
    ).toEqual({ valid: false, reason: "idle" });
  });

  it("expires a session after ninety days even when active", () => {
    expect(
      evaluateSessionPolicy({
        createdAt: ago(SESSION_ABSOLUTE_MS),
        lastSeenAt: ago(60 * 1000),
        now,
      }),
    ).toEqual({ valid: false, reason: "absolute" });
  });

  it("prefers the absolute reason at the boundary", () => {
    expect(
      evaluateSessionPolicy({
        createdAt: ago(SESSION_ABSOLUTE_MS + 1000),
        lastSeenAt: ago(SESSION_IDLE_MS + 1000),
        now,
      }),
    ).toEqual({ valid: false, reason: "absolute" });
  });
});
