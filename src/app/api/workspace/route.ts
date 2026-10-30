import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import { updateWorkspaceSchema, fieldErrorsFrom } from "@/modules/tenancy/schemas";
import { getWorkspaceOverview, updateWorkspaceProfile } from "@/modules/tenancy/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

/**
 * GET /api/workspace
 *
 * The workspace is derived from the session. A `workspaceId` query parameter
 * is not read; adding one changes nothing.
 */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const overview = await getWorkspaceOverview(scope);
    return NextResponse.json(overview, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/**
 * PATCH /api/workspace
 *
 * The body schema has no `workspaceId` field, and Zod strips unknown keys. Even
 * if a caller supplies one, the update uses the scope's workspace id and RLS
 * applies a second constraint.
 */
export async function PATCH(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const body: unknown = await request.json();
    const parsed = updateWorkspaceSchema.safeParse(body);
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

    const overview = await updateWorkspaceProfile(scope, parsed.data, { requestId });
    return NextResponse.json(overview, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
