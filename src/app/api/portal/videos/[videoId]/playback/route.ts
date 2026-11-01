import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getPortalContext } from "@/modules/identity/session";
import { issuePortalVideoPlayback } from "@/modules/videos";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const portal = await getPortalContext();
    const { videoId } = await context.params;
    const result = await issuePortalVideoPlayback(portal, videoId, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
