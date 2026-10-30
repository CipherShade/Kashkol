import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { inviteMemberSchema } from "@/modules/tenancy/schemas";
import { inviteMember, listMembers, listWorkspaceInvitations } from "@/modules/tenancy/service";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const [members, invitations] = await Promise.all([
      listMembers(scope),
      listWorkspaceInvitations(scope),
    ]);
    return NextResponse.json(
      { members, invitations },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", messageKey: "errors.validationFailed", requestId } },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }
    const parsed = inviteMemberSchema.safeParse(body);
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

    const locale = request.headers.get("accept-language")?.toLowerCase().startsWith("en")
      ? "en"
      : "ar";
    const invitation = await inviteMember(scope, parsed.data, locale, { requestId });
    return NextResponse.json(
      { invitation },
      { status: 201, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
