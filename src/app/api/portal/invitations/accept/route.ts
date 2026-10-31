import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { getAuthenticatedUser } from "@/modules/identity/session";
import {
  acceptPortalInvitation,
  acceptPortalInvitationSchema,
} from "@/modules/portals";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const user = await getAuthenticatedUser();
    if (!user) {
      throw new AppError("UNAUTHORIZED");
    }

    const body = await request.json();
    const parsed = acceptPortalInvitationSchema.safeParse(body);
    if (!parsed.success) {
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

    const localeHeader = request.headers.get("x-locale") ?? "ar";
    const result = await acceptPortalInvitation(user.id, parsed.data, {
      requestId,
      locale: localeHeader,
    });

    return NextResponse.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
