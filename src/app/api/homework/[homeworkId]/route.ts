import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { archiveHomeworkSchema, updateHomeworkSchema } from "@/modules/homework/schemas";
import { archiveHomework, updateHomework } from "@/modules/homework/service";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ homeworkId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { homeworkId } = await context.params;
    const body = await request.json();
    if (body && typeof body === "object" && "archived" in body) {
      const parsed = archiveHomeworkSchema.safeParse(body);
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
        await archiveHomework(scope, homeworkId, parsed.data.archived, { requestId }),
        {
          headers: { "x-request-id": requestId, "cache-control": "no-store" },
        },
      );
    }
    const parsed = updateHomeworkSchema.safeParse(body);
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
    return NextResponse.json(await updateHomework(scope, homeworkId, parsed.data, { requestId }), {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
