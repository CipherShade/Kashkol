import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom } from "@/modules/identity/schemas";
import {
  getNotificationSettings,
  notificationSettingsSchema,
  updateNotificationSettings,
} from "@/modules/messaging";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

/**
 * GET /api/messaging/settings
 *
 * Requires `integrations:read`. Provider credentials are never returned: the
 * response reports only whether a provider configuration exists.
 */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const settings = await getNotificationSettings(scope);
    return NextResponse.json(settings, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/**
 * PUT /api/messaging/settings
 *
 * Requires `integrations:write`. Only preferences the outbox can honour are
 * accepted; unknown keys (including `providerConfig`) are stripped by the
 * schema, and the change is written with an audit event in the same
 * transaction.
 */
export async function PUT(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
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
    }

    const parsed = notificationSettingsSchema.safeParse(body);
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

    const settings = await updateNotificationSettings(scope, parsed.data, { requestId });
    return NextResponse.json(settings, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
