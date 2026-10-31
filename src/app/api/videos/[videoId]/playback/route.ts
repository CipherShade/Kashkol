import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import {
  issueStaffVideoPlayback,
  refreshVideoAssetMetadata,
} from "@/modules/videos";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { videoId } = await context.params;
    let action = "playback";
    try {
      const body = (await request.json()) as { action?: string };
      if (body?.action === "refresh_metadata") {
        action = "refresh_metadata";
      }
    } catch {
      // default to playback
    }

    if (action === "refresh_metadata") {
      const refreshed = await refreshVideoAssetMetadata(scope, videoId, { requestId });
      return NextResponse.json(refreshed, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    const result = await issueStaffVideoPlayback(scope, videoId, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
