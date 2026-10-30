import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { LOCALE_COOKIE } from "@/lib/theme";
import { REQUEST_ID_HEADER, newRequestId } from "@/lib/http/request-id";
import {
  isAppPath,
  isBuiltAppPath,
  localeFromPath,
} from "@/lib/navigation/built-paths";

const intlMiddleware = createMiddleware(routing);

function preferredLocale(request: NextRequest): "ar" | "en" {
  const fromPath = localeFromPath(request.nextUrl.pathname);
  if (fromPath) return fromPath;
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  return fromCookie === "en" ? "en" : "ar";
}

/**
 * Next.js 16 proxy (formerly middleware.ts).
 *
 * It owns locale routing and one production-only guard: a planned module is a
 * development preview, so a production request for any `/app` path that is not
 * built is rewritten to the localized 404 before the authenticated shell
 * streams. Session and permission checks stay in the server services.
 */
export default function proxy(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();

  if (process.env.NODE_ENV === "production" && isAppPath(request.nextUrl.pathname)) {
    if (!isBuiltAppPath(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale(request)}/not-available`;
      const response = NextResponse.rewrite(url, { status: 404 });
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    }
  }

  const response = intlMiddleware(request);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Skip APIs, health probes, Next internals, and static files.
  matcher: ["/((?!api|healthz|readyz|_next|_vercel|.*\\..*).*)"],
};
