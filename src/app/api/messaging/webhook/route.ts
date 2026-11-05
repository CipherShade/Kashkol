import { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId } from "@/lib/http/request-id";
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/modules/messaging/webhook-signature";

export const dynamic = "force-dynamic";

/**
 * Meta webhook receiver.
 *
 * This endpoint verifies the request signature. It deliberately does **not**
 * claim to process delivery statuses: inbound event handling is not
 * implemented yet, so a verified event is acknowledged without mutating the
 * outbox. The registry description must match this behaviour.
 */
export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const env = getServerEnv();

  if (!env.WHATSAPP_APP_SECRET) {
    return Response.json(
      { status: "disabled", reason: "webhook_not_configured" },
      { status: 503, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyMetaWebhookSignature(rawBody, signature, env.WHATSAPP_APP_SECRET)) {
    return Response.json(
      { status: "unauthorized" },
      { status: 401, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  }

  try {
    JSON.parse(rawBody);
  } catch {
    return Response.json(
      { status: "invalid_payload" },
      { status: 400, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  }

  return Response.json(
    { status: "ok", processed: false },
    { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}

export async function GET(req: NextRequest) {
  const env = getServerEnv();
  const challenge = verifyMetaWebhookChallenge(
    new URL(req.url).searchParams,
    env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  );

  if (!challenge) return new Response("Forbidden", { status: 403 });

  return new Response(challenge, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
