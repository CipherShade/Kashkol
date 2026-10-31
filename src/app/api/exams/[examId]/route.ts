import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import {
  parseExamInput,
  previewOnlineExamForTeacher,
  updateOnlineExamActionSchema,
  updateOnlineExamLifecycle,
} from "@/modules/exams";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ examId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const { examId } = await context.params;
    const preview = await previewOnlineExamForTeacher(scope, examId, { requestId });
    return NextResponse.json(preview, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ examId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { examId } = await context.params;
    const input = parseExamInput(updateOnlineExamActionSchema, await request.json());
    const result = await updateOnlineExamLifecycle(scope, examId, input, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
