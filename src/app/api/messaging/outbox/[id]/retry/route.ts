import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getWorkspaceIdForUser } from "@/lib/auth/workspace";
import { resolveScope } from "@/modules/tenancy/service";
import { newRequestId } from "@/lib/http/request-id";
import { errorResponse } from "@/lib/http/errors";
import { retryMessage } from "@/modules/messaging";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const { id } = await params;
    const session = await requireSession(req);
    const workspaceId = await getWorkspaceIdForUser(session.user.id);
    if (!workspaceId) throw new Error("NO_WORKSPACE");
    const scope = await resolveScope(session.user.id, workspaceId);
    const result = await retryMessage(scope, id, { requestId });
    return Response.json({ data: result }, { headers: { "x-request-id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
