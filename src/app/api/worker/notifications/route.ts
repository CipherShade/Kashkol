import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { hasValidWorkerBearerToken } from "@/lib/http/worker-auth";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  evaluateNotificationRules,
  runBackgroundNotificationRules,
} from "@/modules/notifications/rules";

export const dynamic = "force-dynamic";

const workspaceIdSchema = z.string().uuid();

/**
 * POST /api/worker/notifications
 *
 * Background notification rule evaluator (F-P0-10, F-P2-07).
 *
 * Evaluates notification rules (unrecorded sessions, homework due soon, pending
 * assessment grades) for active workspaces so teachers receive timely alerts
 * without having to open the app or click the bell first.
 *
 * Authentication:
 *  - Staff session: evaluates only that staff member's workspace.
 *  - Worker bearer token (MESSAGING_WORKER_TOKEN): evaluates all active
 *    workspaces (or a single workspace if `workspaceId` is supplied in body).
 */
export async function POST(req: NextRequest) {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Staff session takes precedence
    const staff = await requireStaffSession().catch(() => null);
    if (staff) {
      const result = await evaluateNotificationRules(staff.scope);
      return NextResponse.json(
        { data: result },
        { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
      );
    }

    // Background worker token authentication
    const token = getServerEnv().MESSAGING_WORKER_TOKEN;
    if (!hasValidWorkerBearerToken(req.headers.get("authorization"), token)) {
      throw new AppError("UNAUTHORIZED");
    }

    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : undefined;
    const parsedWorkspaceId = workspaceId ? workspaceIdSchema.safeParse(workspaceId) : undefined;
    if (parsedWorkspaceId && !parsedWorkspaceId.success) {
      throw new AppError("VALIDATION_FAILED");
    }

    const results = await runBackgroundNotificationRules(parsedWorkspaceId?.data);
    return NextResponse.json(
      { data: results },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
