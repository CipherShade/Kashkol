import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  enrollStudentSchema,
  removeStudentSchema,
  fieldErrorsFrom,
} from "@/modules/groups/schemas";
import {
  enrollStudentInGroup,
  removeStudentFromGroup,
} from "@/modules/groups/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { groupId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = enrollStudentSchema.safeParse({ ...body, groupId });

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

    const enrollment = await enrollStudentInGroup(scope, parsed.data, { requestId });
    return NextResponse.json(enrollment, {
      status: 201,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { groupId } = await params;
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");
    const parsed = removeStudentSchema.safeParse({ groupId, studentId });

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

    const result = await removeStudentFromGroup(scope, parsed.data, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
