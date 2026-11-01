import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import {
  getPlatformAdminOverview,
  requirePlatformAdminContext,
  type PlatformWorkspacesQuery,
} from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const admin = await requirePlatformAdminContext();
    const { searchParams } = new URL(request.url);
    const query: Partial<PlatformWorkspacesQuery> = {
      search: searchParams.get("search") ?? undefined,
      status: (searchParams.get("status") as PlatformWorkspacesQuery["status"]) ?? undefined,
      planTier: (searchParams.get("planTier") as PlatformWorkspacesQuery["planTier"]) ?? undefined,
      planStatus:
        (searchParams.get("planStatus") as PlatformWorkspacesQuery["planStatus"]) ?? undefined,
    };

    const overview = await getPlatformAdminOverview(admin, query);
    return NextResponse.json(overview, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
