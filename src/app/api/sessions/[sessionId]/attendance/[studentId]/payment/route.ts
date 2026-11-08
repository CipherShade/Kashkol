import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import { verifyPaymentSchema, fieldErrorsFrom } from "@/modules/attendance/schemas";
import { verifySessionPayment } from "@/modules/attendance/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; studentId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { sessionId, studentId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const parsed = verifyPaymentSchema.safeParse({
      sessionId,
      studentId,
      verified: body.verified,
    });

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

    const updated = await verifySessionPayment(scope, parsed.data, { requestId });
    return NextResponse.json(updated, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
