import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom, issueQrTokenSchema, rotateQrTokenSchema } from "@/modules/attendance/schemas";
import { issueQrToken, rotateQrToken } from "@/modules/attendance/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { sessionId } = await params;
    const { scope } = await requireStaffSession();
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === "rotate") {
      const parsed = rotateQrTokenSchema.safeParse({ sessionId, ...body });
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
      const result = await rotateQrToken(scope, parsed.data, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    const parsed = issueQrTokenSchema.safeParse({ sessionId, ...body });
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
    const result = await issueQrToken(scope, parsed.data, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
