import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import { processOutboxBatch } from "@/modules/messaging";
import type { Scope } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

function hasValidWorkerToken(request: Request, token: string | undefined) {
  const authorization = request.headers.get("authorization");
  if (!token || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const limit = typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 50) : 10;

    // Staff session takes precedence
    const staff = await requireStaffSession().catch(() => null);
    if (staff) {
      const results = await processOutboxBatch(staff.scope, limit);
      return NextResponse.json(
        { data: results },
        { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
      );
    }

    // Shared worker token authentication
    const token = getServerEnv().REPORT_EXPORT_WORKER_TOKEN;
    if (token && hasValidWorkerToken(req, token) && typeof body.workspaceId === "string") {
      const workerScope: Scope = {
        workspaceId: body.workspaceId,
        actorUserId: "system:worker",
        actorDisplayName: "Worker",
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
