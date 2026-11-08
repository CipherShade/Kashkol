import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  bulkRecordHomeworkCompletionSchema,
} from "@/modules/homework/schemas";
import {
  getHomeworkCompletionRoster,
  bulkRecordHomeworkCompletion,
} from "@/modules/homework/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; homeworkId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const { sessionId, homeworkId } = await params;
    const roster = await getHomeworkCompletionRoster(scope, homeworkId, sessionId);
    return NextResponse.json(roster, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; homeworkId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { sessionId, homeworkId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const parsed = bulkRecordHomeworkCompletionSchema.safeParse({
      homeworkId,
      sessionId,
      marks: body.marks,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: parsed.error.flatten().fieldErrors,
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    const result = await bulkRecordHomeworkCompletion(scope, parsed.data, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
