import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { getStudentProgress } from "@/modules/performance/service";
import { studentPerformanceQuerySchema } from "@/modules/performance/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ studentId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const { studentId } = await context.params;
    const parsed = studentPerformanceQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            details: fieldErrorsFrom(parsed.error),
          },
        },
        { status: 422, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }
    const result = await getStudentProgress(scope, studentId, parsed.data);
    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
