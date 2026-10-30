import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { listHomeworkResources } from "@/modules/homework/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    return NextResponse.json(await listHomeworkResources(scope), {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
