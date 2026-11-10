import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TOKENS = {
  messaging: "m".repeat(48),
  reports: "w".repeat(48),
};

const sessionMock = vi.hoisted(() => ({ requireStaffSession: vi.fn() }));
vi.mock("@/modules/identity/session", () => ({
  requireStaffSession: sessionMock.requireStaffSession,
}));

import { AppError } from "@/lib/http/errors";
import { resetServerEnvForTests } from "@/lib/config/env";
import { POST as outboxPost } from "@/app/api/worker/outbox/route";
import { POST as reportsPost } from "@/app/api/worker/reports/route";
import { disconnectDb } from "@/lib/db/client";

beforeAll(() => {
  process.env.MESSAGING_WORKER_TOKEN = TOKENS.messaging;
  process.env.REPORT_EXPORT_WORKER_TOKEN = TOKENS.reports;
  // Mirror the at-boot configuration with the tokens set above.
  resetServerEnvForTests();
  // Force the staff session path to fail so each test exercises the worker
  // token fallback deterministically.
  sessionMock.requireStaffSession.mockRejectedValue(new AppError("UNAUTHORIZED"));
});

afterAll(async () => {
  delete process.env.MESSAGING_WORKER_TOKEN;
  delete process.env.REPORT_EXPORT_WORKER_TOKEN;
  await disconnectDb();
});

function outboxRequest({
  authorization,
  body = { limit: 10 },
}: {
  authorization?: string;
  body?: Record<string, unknown>;
} = {}): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization) headers.authorization = authorization;
  return new NextRequest("http://localhost:3000/api/worker/outbox", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

function reportsRequest(authorization?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost:3000/api/worker/reports", {
    method: "POST",
    headers,
  });
}

describe("worker routes — authentication and token independence", () => {
  it("rejects /api/worker/outbox with no session and no bearer token", async () => {
    const response = await outboxPost(outboxRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("data");
  });

  it("rejects /api/worker/reports with no bearer token", async () => {
    const response = await reportsPost(reportsRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("data");
  });

  it("rejects /api/worker/outbox with a wrong token", async () => {
    const response = await outboxPost(outboxRequest({ authorization: `Bearer ${"x".repeat(TOKENS.messaging.length)}` }));
    expect(response.status).toBe(401);
  });

  it("rejects the report export token on /api/worker/outbox", async () => {
    const response = await outboxPost(outboxRequest({ authorization: `Bearer ${TOKENS.reports}` }));
    expect(response.status).toBe(401);
  });

  it("rejects the messaging token on /api/worker/reports", async () => {
    const response = await reportsPost(reportsRequest(`Bearer ${TOKENS.messaging}`));
    expect(response.status).toBe(401);
  });

  it("rejects /api/worker/outbox with a valid token but no uuid workspace id", async () => {
    const response = await outboxPost(
      outboxRequest({
        authorization: `Bearer ${TOKENS.messaging}`,
        body: { workspaceId: "not-a-uuid" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("drains an empty outbox batch with the correct messaging token", async () => {
    const response = await outboxPost(
      outboxRequest({
        authorization: `Bearer ${TOKENS.messaging}`,
        body: { workspaceId: "00000000-0000-4000-8000-0000000000aa", limit: 1 },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });

  it("drains an empty report export queue with the correct report token", async () => {
    const response = await reportsPost(reportsRequest(`Bearer ${TOKENS.reports}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });
});
