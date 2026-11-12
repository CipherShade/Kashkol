import { NextRequest, NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { assertRateLimit, getClientIp } from "@/lib/http/rate-limit";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import { scanStudentQrSchema, fieldErrorsFrom } from "@/modules/attendance/schemas";
import { scanStudentQrCode } from "@/modules/attendance/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    // Scanning is a staff-camera action; rate-limit per client IP so a
    // device cannot brute-force or flood scans.
    assertRateLimit(`attendance:scan:${getClientIp(request)}`, 10, 60_000);

    const { scope } = await requireStaffSession();
    const { sessionId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const parsed = scanStudentQrSchema.safeParse({
      sessionId,
      qrToken: body.qrToken,
      paymentVerified: body.paymentVerified,
      markLate: body.markLate,
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

    const result = await scanStudentQrCode(scope, parsed.data, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
