import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { hasValidWorkerBearerToken } from "@/lib/http/worker-auth";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import { processOutboxBatch } from "@/modules/messaging";
import type { Scope } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

const workspaceIdSchema = z.string().uuid();

export async function POST(req: NextRequest) {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const limit = typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 50) : 10;

    // Staff session takes precedence.
    const staff = await requireStaffSession().catch(() => null);
    if (staff) {
      const results = await processOutboxBatch(staff.scope, limit);
      return NextResponse.json(
        { data: results },
        { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
      );
    }

    // Background worker: a dedicated token, never the report-export credential.
    const token = getServerEnv().MESSAGING_WORKER_TOKEN;
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : undefined;
    const parsedWorkspaceId = workspaceIdSchema.safeParse(workspaceId);

    if (hasValidWorkerBearerToken(req.headers.get("authorization"), token) && parsedWorkspaceId.success) {
      const workerScope: Scope = {
        workspaceId: parsedWorkspaceId.data,
        actorUserId: "system:messaging-worker",
        actorDisplayName: "Messaging worker",
        role: "owner",
        permissions: new Set(),
      };
      const results = await processOutboxBatch(workerScope, limit);
      return NextResponse.json(
        { data: results },
        { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
      );
    }

    throw new AppError("UNAUTHORIZED");
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
