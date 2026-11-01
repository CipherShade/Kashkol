import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { getWorkspacePlanAndSupportSummary } from "@/modules/platform-admin";
import { findWorkspaceSubscriptionRow } from "@/modules/tenancy/repository";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const row = await findWorkspaceSubscriptionRow(scope);
    if (!row) {
      throw new AppError("NOT_FOUND");
    }
    const summary = await getWorkspacePlanAndSupportSummary(scope, row);
    return NextResponse.json(summary, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
