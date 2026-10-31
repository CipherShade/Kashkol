import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStudentPortalContext } from "@/modules/identity/session";
import {
  parseExamInput,
  saveStudentExamResponses,
  saveStudentExamResponsesSchema,
  submitStudentOnlineExamAttempt,
} from "@/modules/exams";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ examId: string; attemptId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const portal = await requireStudentPortalContext();
    const { examId, attemptId } = await context.params;
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");
    const input = parseExamInput(saveStudentExamResponsesSchema, await request.json());
    const result = await saveStudentExamResponses(
      portal,
      examId,
      attemptId,
      input,
      studentId,
    );
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ examId: string; attemptId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const portal = await requireStudentPortalContext();
    const { examId, attemptId } = await context.params;
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");
    const input = parseExamInput(saveStudentExamResponsesSchema, await request.json());
    const result = await submitStudentOnlineExamAttempt(
      portal,
      examId,
      attemptId,
      input,
      studentId,
      { requestId },
    );
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
