import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  bulkMarkAttendanceSchema,
  closeSessionSchema,
  correctAttendanceSchema,
  fieldErrorsFrom,
  markAllPresentSchema,
  markAttendanceSchema,
} from "@/modules/attendance/schemas";
import {
  bulkMarkAttendance,
  closeSessionAttendance,
  correctAttendance,
  getSessionRoster,
  markAllPresent,
  markAttendance,
} from "@/modules/attendance/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { sessionId } = await params;
    const { scope } = await requireStaffSession();
    const data = await getSessionRoster(scope, sessionId);
    return NextResponse.json(data, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
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

    if (body.action === "mark") {
      const parsed = markAttendanceSchema.safeParse({ sessionId, ...body });
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
      const result = await markAttendance(scope, parsed.data, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "bulk_mark") {
      const parsed = bulkMarkAttendanceSchema.safeParse({ sessionId, ...body });
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
      const result = await bulkMarkAttendance(scope, parsed.data, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "mark_all_present") {
      const parsed = markAllPresentSchema.safeParse({ sessionId });
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
      const result = await markAllPresent(scope, parsed.data, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "correct") {
      const parsed = correctAttendanceSchema.safeParse({ sessionId, ...body });
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
      const result = await correctAttendance(scope, parsed.data, { requestId });
      return NextResponse.json(result, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "close") {
      const parsed = closeSessionSchema.safeParse({ sessionId, ...body });
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
      const result = await closeSessionAttendance(scope, parsed.data, { requestId });
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
