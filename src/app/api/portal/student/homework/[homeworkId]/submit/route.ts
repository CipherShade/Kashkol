import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStudentPortalContext } from "@/modules/identity/session";
import { submitStudentHomework } from "@/modules/portals";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ homeworkId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const portal = await requireStudentPortalContext();
    const { homeworkId } = await params;
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");

    const submission = await submitStudentHomework(
      portal,
      homeworkId,
      studentId,
    );
    return NextResponse.json(
      { submission },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
