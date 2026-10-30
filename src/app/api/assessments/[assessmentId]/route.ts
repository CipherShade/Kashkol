import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { assessmentLockSchema } from "@/modules/assessments/schemas";
import { getAssessment, setAssessmentLock } from "@/modules/assessments/service";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ assessmentId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const { assessmentId } = await context.params;
    return NextResponse.json(await getAssessment(scope, assessmentId), {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assessmentId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { assessmentId } = await context.params;
    const parsed = assessmentLockSchema.safeParse(await request.json());
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
    return NextResponse.json(
      await setAssessmentLock(
        scope,
        assessmentId,
        parsed.data.action,
        parsed.data.action === "unlock" ? parsed.data.reason : undefined,
        { requestId },
      ),
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
