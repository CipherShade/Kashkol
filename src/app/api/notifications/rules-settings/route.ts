import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import {
  getNotificationRuleSettings,
  updateNotificationRuleSettings,
} from "@/modules/notifications/service";
import {
  notificationRulesSettingsSchema,
  publicNotificationRuleConfig,
} from "@/modules/notifications/settings";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

/**
 * GET/POST /api/notifications/rules-settings
 *
 * F-P2-07 staff workspace rule configuration. The workspace id comes from the
 * session. Mutations require `settings:write` and a trusted origin.
 */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const settings = await getNotificationRuleSettings(scope);
    return NextResponse.json({
      rules: publicNotificationRuleConfig(settings.rules),
      emailDigestEnabled: settings.emailDigestEnabled,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const parsed = notificationRulesSettingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(parsed.error, requestId);
    }
    const ipHash = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const settings = await updateNotificationRuleSettings(scope, parsed.data, {
      requestId,
      ipHash,
    });
    return NextResponse.json({
      rules: publicNotificationRuleConfig(settings.rules),
      emailDigestEnabled: settings.emailDigestEnabled,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
