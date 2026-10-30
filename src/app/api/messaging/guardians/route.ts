import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getWorkspaceIdForUser } from "@/lib/auth/workspace";
import { resolveScope } from "@/modules/tenancy/service";
import { newRequestId } from "@/lib/http/request-id";
import { errorResponse } from "@/lib/http/errors";
import { withScope } from "@/lib/db/scope";
import { createGuardian } from "@/modules/messaging/repository";
import { z } from "zod";

const CreateGuardianSchema = z.object({
  studentId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  relation: z.enum(["mother", "father", "other", "legal_guardian"]).optional(),
  phoneE164: z.string().regex(/^\+[1-9][0-9]{6,14}$/),
  email: z.string().email().optional(),
  isPrimary: z.boolean().optional(),
  isAuthorized: z.boolean().optional(),
  consentGiven: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const session = await requireSession(req);
    const workspaceId = await getWorkspaceIdForUser(session.user.id);
    if (!workspaceId) throw new Error("NO_WORKSPACE");
    const scope = await resolveScope(session.user.id, workspaceId);
    const search = new URL(req.url).searchParams;
    const studentId = search.get("studentId");
    if (!studentId) throw new Error("MISSING_STUDENT");
    const guardians = await withScope(scope, async (tx) => {
      return tx.guardian.findMany({
        where: { workspaceId: scope.workspaceId, studentId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      });
    });
    return Response.json({ data: guardians }, { headers: { "x-request-id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const session = await requireSession(req);
    const workspaceId = await getWorkspaceIdForUser(session.user.id);
    if (!workspaceId) throw new Error("NO_WORKSPACE");
    const scope = await resolveScope(session.user.id, workspaceId);
    const body = await req.json();
    const input = CreateGuardianSchema.parse(body);
    const guardian = await withScope(scope, async (tx) => {
      return createGuardian(tx, scope.workspaceId, input);
    });
    return Response.json({ data: guardian }, { status: 201, headers: { "x-request-id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
