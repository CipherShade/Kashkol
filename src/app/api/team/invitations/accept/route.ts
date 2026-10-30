import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getVerifiedSession } from "@/modules/identity/session";
import { invitationTokenSchema } from "@/modules/tenancy/schemas";
import { acceptInvitation } from "@/modules/tenancy/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const session = await getVerifiedSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", messageKey: "errors.unauthorized", requestId } },
        { status: 401, headers: { "x-request-id": requestId } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", messageKey: "errors.validationFailed", requestId } },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    const token = invitationTokenSchema.safeParse(
      typeof body === "object" && body !== null && "token" in body
        ? body.token
        : undefined,
    );
    if (!token.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", messageKey: "errors.validationFailed", requestId } },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    const result = await acceptInvitation(
      {
        userId: session.user.id,
        email: session.user.email,
        displayName: session.user.name,
        emailVerified: session.user.emailVerified,
      },
      token.data,
      { requestId },
    );
    return NextResponse.json(
      { accepted: true, workspaceId: result.workspaceId },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
