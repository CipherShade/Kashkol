import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { requireStaffSession } from "@/modules/identity/session";
import { confirmWorkspaceRestore } from "@/modules/workspace-backup/service";
import { restoreConfirmSchema } from "@/modules/workspace-backup/schemas";

export const dynamic = "force-dynamic";

/** F22: the destructive job starts only after an exact typed phrase and matching preview. */
export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.validationFailed" });
    }
    const parsed = restoreConfirmSchema.safeParse(body);
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
    const job = await confirmWorkspaceRestore(scope, parsed.data, requestId);
    return NextResponse.json(
      { data: job },
      { status: 202, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
