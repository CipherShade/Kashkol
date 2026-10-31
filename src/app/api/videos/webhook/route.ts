import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { consumeVideoProviderWebhook } from "@/modules/videos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
      throw new AppError("VALIDATION_FAILED");
    }
    const signatureHeader = request.headers.get("webhook-signature");
    const rawBody = await request.text();
    const result = await consumeVideoProviderWebhook({
      workspaceId,
      rawBody,
      signatureHeader,
    });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
