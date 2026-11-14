import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  addSessionAttendeeSchema,
  fieldErrorsFrom,
  removeSessionAttendeeSchema,
} from "@/modules/attendance/schemas";
import { addSessionAttendee, removeSessionAttendee } from "@/modules/attendance/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { sessionId } = await params;
    const { scope } = await requireStaffSession();
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === "add_session_attendee") {
      const parsed = addSessionAttendeeSchema.safeParse({ sessionId, ...body });
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
      const result = await addSessionAttendee(scope, parsed.data, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          messageKey: "errors.validationFailed",
          requestId,
        },
      },
      { status: 422, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { sessionId } = await params;
    const { scope } = await requireStaffSession();
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === "remove_session_attendee") {
      const parsed = removeSessionAttendeeSchema.safeParse({ sessionId, ...body });
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
      const result = await removeSessionAttendee(scope, parsed.data, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          messageKey: "errors.validationFailed",
          requestId,
        },
      },
      { status: 422, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}