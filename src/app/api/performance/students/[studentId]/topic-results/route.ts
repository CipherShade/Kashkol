import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { saveTopicResults } from "@/modules/performance/service";
import { saveTopicResultsSchema } from "@/modules/performance/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ studentId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { studentId } = await context.params;
    const parsed = saveTopicResultsSchema.safeParse(await request.json());
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
    return NextResponse.json(await saveTopicResults(scope, studentId, parsed.data, { requestId }), {
      status: 201,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
