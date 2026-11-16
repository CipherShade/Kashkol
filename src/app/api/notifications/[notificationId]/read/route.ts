import { NextResponse } from "next/server";
import { errorResponse, AppError } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { markMyNotificationRead } from "@/modules/notifications";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const { notificationId } = await params;
    const ok = await markMyNotificationRead(scope, notificationId);
    if (!ok) {
      throw new AppError("NOT_FOUND");
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
