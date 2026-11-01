import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import {
  assignWorkspacePlan,
  changeWorkspaceAccountStatus,
  getPlatformWorkspaceDetail,
  grantBreakGlassSupportAccess,
  requirePlatformAdminContext,
  revokeBreakGlassSupportAccess,
} from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const admin = await requirePlatformAdminContext();
    const { workspaceId } = await context.params;
    const detail = await getPlatformWorkspaceDetail(admin, workspaceId);
    return NextResponse.json(detail, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const admin = await requirePlatformAdminContext();
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const operation = body?.operation ?? body?.action;

    if (operation === "update_plan") {
      const result = await assignWorkspacePlan(admin, workspaceId, body, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (operation === "update_status") {
      const result = await changeWorkspaceAccountStatus(admin, workspaceId, body, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (operation === "grant_break_glass") {
      const result = await grantBreakGlassSupportAccess(admin, workspaceId, body, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (operation === "revoke_break_glass") {
      const result = await revokeBreakGlassSupportAccess(admin, workspaceId, body, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    throw new AppError("VALIDATION_FAILED", {
      fields: { operation: ["invalid_operation"] },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
