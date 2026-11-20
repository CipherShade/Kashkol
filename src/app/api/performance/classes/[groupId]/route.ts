import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { getClassIntelligence } from "@/modules/performance/service";
import { classIntelligenceQuerySchema } from "@/modules/performance/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const { groupId } = await context.params;
    const parsed = classIntelligenceQuerySchema.safeParse({
      ...Object.fromEntries(new URL(request.url).searchParams.entries()),
      groupId,
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
    return NextResponse.json(await getClassIntelligence(scope, parsed.data), {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
