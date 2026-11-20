import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { getBulkGradeFormData } from "@/modules/performance/service";

export const dynamic = "force-dynamic";

const querySchema = z.object({ groupId: z.string().uuid() });

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
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
    return NextResponse.json(await getBulkGradeFormData(scope, parsed.data.groupId), {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
