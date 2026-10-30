import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  createOneOffSessionSchema,
  fieldErrorsFrom,
  generateSessionsSchema,
  sessionQuerySchema,
  updateSessionSchema,
} from "@/modules/sessions/schemas";
import { createOneOffSession, generateSessions, getSessions, updateSession } from "@/modules/sessions/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams.entries());
    const parsed = sessionQuerySchema.safeParse(rawParams);

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

    const sessions = await getSessions(scope, parsed.data);
    return NextResponse.json(sessions, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const body = (await request.json()) as Record<string, unknown>;

    // Check if it's a generate request or create one-off
    if (body.action === "generate") {
      const parsed = generateSessionsSchema.safeParse(body);
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
      const result = await generateSessions(scope, parsed.data);
      return NextResponse.json(result, {
        status: 201,
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }

    if (body.action === "update") {
      const parsed = updateSessionSchema.safeParse(body);
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

    const parsed = createOneOffSessionSchema.safeParse(body);
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

    const session = await createOneOffSession(scope, parsed.data, { requestId });
    return NextResponse.json(session, {
      status: 201,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
