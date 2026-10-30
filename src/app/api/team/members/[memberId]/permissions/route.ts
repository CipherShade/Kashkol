import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom, updateMemberPermissionsSchema } from "@/modules/tenancy/schemas";
import { updateMemberPermissions } from "@/modules/tenancy/service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", messageKey: "errors.validationFailed", requestId } },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }
    const parsed = updateMemberPermissionsSchema.safeParse(body);
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
    const { memberId } = await params;
    const grants = await updateMemberPermissions(scope, memberId, parsed.data.grants, { requestId });
    return NextResponse.json(
      { grants },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
