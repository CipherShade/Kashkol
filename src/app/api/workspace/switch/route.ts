import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom, switchWorkspaceSchema } from "@/modules/tenancy/schemas";
import { switchWorkspace } from "@/modules/tenancy/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/switch
 *
 * The body names only a candidate target. The session, the source workspace,
 * and the user identity come from the verified staff session; the service
 * rechecks membership inside a transaction scoped to the target workspace.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);

    const session = await requireStaffSession();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", messageKey: "errors.validationFailed", requestId } },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    const parsed = switchWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: fieldErrorsFrom(parsed.error),
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    const workspace = await switchWorkspace(
      {
        userId: session.user.id,
        displayName: session.user.name,
        sessionId: session.sessionId,
        currentWorkspaceId: session.scope.workspaceId,
      },
      parsed.data,
      { requestId },
    );

    return NextResponse.json(workspace, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
