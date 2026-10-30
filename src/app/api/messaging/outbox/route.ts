import { NextRequest } from "next/server";
import { newRequestId } from "@/lib/http/request-id";
import { errorResponse } from "@/lib/http/errors";
import { requireStaffSession } from "@/modules/identity/session";
import { ListOutboxSchema } from "@/modules/messaging";
import { listOutbox } from "@/modules/messaging/service";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const search = new URL(req.url).searchParams;
    const input = ListOutboxSchema.parse({
      status: search.get("status") || undefined,
      limit: search.get("limit") || undefined,
      offset: search.get("offset") || undefined,
    });
    const result = await listOutbox(scope, input);
    return Response.json({ data: result }, { headers: { "x-request-id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
