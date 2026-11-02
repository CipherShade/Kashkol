import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStudentPortalContext } from "@/modules/identity/session";
import { checkInWithQrToken } from "@/modules/attendance/self-checkin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const checkInSchema = z.object({
  token: z.string().trim().min(1, { message: "invalidToken" }),
  /** Optional explicit student selection when the account links more than one. */
  studentId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const portal = await requireStudentPortalContext();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = checkInSchema.safeParse(body);
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

    // A student-linked account checks itself in. A parent-kind grant never
    // self-checks in; the token was displayed for enrolled students to scan.
    const studentId = parsed.data.studentId ?? null;
    const grants = portal.grants.filter(
      (grant) => grant.kind === "student" && (studentId === null || grant.studentId === studentId),
    );

    if (grants.length === 0 || (studentId !== null && grants.every((g) => g.studentId !== studentId))) {
      return NextResponse.json(
        {
          error: { code: "FORBIDDEN", messageKey: "errors.forbidden", requestId },
        },
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }

    // The route does not accept a workspace or student from the client beyond
    // the optional disambiguation above: every grant carries its own verified
    // workspace and student linkage, and each check-in runs inside it.
    let lastError: unknown = null;
    for (const grant of grants) {
      try {
        const result = await checkInWithQrToken(
          {
            userId: portal.userId,
            workspaceId: grant.workspaceId,
            studentId: grant.studentId,
            displayName: portal.user?.name ?? "",
          },
          { token: parsed.data.token, requestId },
        );
        return NextResponse.json(result, {
          headers: { "x-request-id": requestId, "cache-control": "no-store" },
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("unreachable");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
