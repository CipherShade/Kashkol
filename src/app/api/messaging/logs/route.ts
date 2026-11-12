import { NextRequest } from "next/server";
import { newRequestId } from "@/lib/http/request-id";
import { errorResponse } from "@/lib/http/errors";
import { requireStaffSession } from "@/modules/identity/session";
import { listDeliveryLogs } from "@/modules/messaging";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const search = new URL(req.url).searchParams;
    const limit = Number(search.get("limit") || 100);
    const logs = await listDeliveryLogs(scope, limit);
    return Response.json({ data: logs }, { headers: { "x-request-id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
