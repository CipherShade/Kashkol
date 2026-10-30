import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { removeMember } from "@/modules/tenancy/service";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { memberId } = await params;
    await removeMember(scope, memberId, { requestId });
    return NextResponse.json(
      { ok: true },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
