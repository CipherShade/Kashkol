import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  cancelSessionSchema,
  completeSessionSchema,
  fieldErrorsFrom,
  rescheduleSessionSchema,
  startSessionSchema,
  updateSessionSchema,
} from "@/modules/sessions/schemas";
import {
  cancelSession,
  completeSession,
  getSession,
  rescheduleSession,
  startSession,
  updateSession,
} from "@/modules/sessions/service";
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
    const session = await getSession(scope, sessionId);
    return NextResponse.json(session, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(
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

    if (body.action === "cancel") {
      const parsed = cancelSessionSchema.safeParse({ id: sessionId, reason: body.reason, scope: body.scope });
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
      const session = await cancelSession(scope, parsed.data, { requestId });
      return NextResponse.json(session, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "start") {
      const parsed = startSessionSchema.safeParse({ id: sessionId });
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
      const session = await startSession(scope, parsed.data, { requestId });
      return NextResponse.json(session, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "complete") {
      const parsed = completeSessionSchema.safeParse({ id: sessionId });
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
      const session = await completeSession(scope, parsed.data, { requestId });
      return NextResponse.json(session, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "update") {
      const parsed = updateSessionSchema.safeParse({ id: sessionId, ...body });
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
      const session = await updateSession(scope, parsed.data, { requestId });
      return NextResponse.json(session, {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    const parsed = rescheduleSessionSchema.safeParse({ id: sessionId, ...body });
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

    const session = await rescheduleSession(scope, parsed.data, { requestId });
    return NextResponse.json(session, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
