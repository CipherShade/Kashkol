import { NextRequest } from "next/server";
import { newRequestId } from "@/lib/http/request-id";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    // Webhook signature verification placeholder - only verify if configured
    // Make idempotent by processing based on message id
    const body = await req.json().catch(() => ({}));
    // Do not log full bodies or tokens
    return Response.json({ status: "ok" }, { headers: { "x-request-id": requestId } });
  } catch (err) {
    return Response.json({ error: "webhook_error" }, { status: 400, headers: { "x-request-id": requestId } });
  }
}

export async function GET(req: NextRequest) {
  // For webhook verification (e.g., Meta webhook verification)
  const search = new URL(req.url).searchParams;
  const mode = search.get("hub.mode");
  const token = search.get("hub.verify_token");
  const challenge = search.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}
