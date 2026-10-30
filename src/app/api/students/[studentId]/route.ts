import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  updateStudentSchema,
  fieldErrorsFrom,
} from "@/modules/students/schemas";
import {
  archiveStudent,
  deleteStudent,
  getStudentProfileDetails,
  updateStudent,
} from "@/modules/students/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const { studentId } = await params;
    const profile = await getStudentProfileDetails(scope, studentId);
    return NextResponse.json(profile, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { studentId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = updateStudentSchema.safeParse({ ...body, id: studentId });

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

    const result = await updateStudent(scope, parsed.data, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { studentId } = await params;
    const url = new URL(request.url);
    const hardDelete = url.searchParams.get("hard") === "true";

    if (hardDelete) {
      const result = await deleteStudent(scope, studentId, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    const result = await archiveStudent(scope, studentId, { requestId });
    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
