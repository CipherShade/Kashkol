import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { requestWorkspaceBackup } from "@/modules/workspace-backup/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** F-P2-11 AC-1: an owner queues a full workspace JSON backup. */
export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const job = await requestWorkspaceBackup(scope, requestId);
    return NextResponse.json(
      { data: job },
      { status: 202, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
