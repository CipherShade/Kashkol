import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  isWebPushConfigured: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({
  getServerEnv: envMock.getServerEnv,
  isWebPushConfigured: envMock.isWebPushConfigured,
}));

import { dispatchWebPushNotification } from "@/modules/portals/push";

const subscription = {
  endpoint: "https://push.example.com/sub/1",
  p256dhKey: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls",
  authKey: "tBHItJI5svbpez7KI4CCXg",
  includeSensitiveDetails: false,
};

const input = {
  kind: "parent" as const,
  locale: "en" as const,
  eventType: "attendance" as const,
  summaryText: "Attendance recorded.",
};

describe("Web Push dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports unconfigured without calling the transport when VAPID keys are absent", async () => {
    envMock.isWebPushConfigured.mockReturnValue(false);
    const send = vi.fn();

    const result = await dispatchWebPushNotification(subscription, input, send);

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("unconfigured");
    expect(send).not.toHaveBeenCalled();
  });

  it("reports delivered only after the push transport accepted the payload", async () => {
    envMock.isWebPushConfigured.mockReturnValue(true);
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchWebPushNotification(subscription, input, send);

    expect(result.delivered).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(subscription, expect.any(String));
    expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({
      title: expect.any(String),
      body: expect.any(String),
      url: "/en/portal/parent",
    });
  });

  it("reports send_failed instead of claiming delivery when the transport rejects", async () => {
    envMock.isWebPushConfigured.mockReturnValue(true);
    const send = vi.fn().mockRejectedValue(new Error("push service unavailable"));

    const result = await dispatchWebPushNotification(subscription, input, send);

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("send_failed");
  });
});
