import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getWorkspaceIdForUser } from "@/lib/auth/workspace";
import { resolveScope } from "@/modules/tenancy/service";
import { newRequestId } from "@/lib/http/request-id";
import { errorResponse } from "@/lib/http/errors";
import { enqueueAttendanceNotification, EnqueueAttendanceNotificationSchema } from "@/modules/messaging";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const session = await requireSession(req);
    const workspaceId = await getWorkspaceIdForUser(session.user.id);
    if (!workspaceId) throw new Error("NO_WORKSPACE");
    const scope = await resolveScope(session.user.id, workspaceId);
    const body = await req.json();
    const input = EnqueueAttendanceNotificationSchema.parse(body);
    const result = await enqueueAttendanceNotification(scope, input, { requestId });
    return Response.json({ data: result }, { status: 201, headers: { "x-request-id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
