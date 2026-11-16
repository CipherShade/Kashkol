import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { getServerEnv } from "@/lib/config/env";
import { firstForwardedIp } from "@/lib/http/csrf";
import { newRequestId } from "@/lib/http/request-id";
import { hashIdentifier, hashIp } from "./hash";
import { AUTH_EVENTS, isAccountLocked, recordSignInFailure } from "./lockout";
import { insertAuthEvent } from "./repository";

type AuthContext = {
  path: string;
  body?: unknown;
  headers?: Headers;
  context: {
    returned?: unknown;
    newSession?: { user?: { id?: string } } | null;
    session?: { user?: { id?: string } } | null;
    sessionConfig?: { freshAge?: number };
  };
};

function bodyEmail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email : null;
}

function requestId(ctx: AuthContext): string {
  return ctx.headers?.get("x-request-id") ?? newRequestId();
}

function contextHashes(ctx: AuthContext) {
  const secret = getServerEnv().BETTER_AUTH_SECRET;
  const ip = firstForwardedIp(ctx.headers ?? new Headers());
  const userAgent = ctx.headers?.get("user-agent") ?? null;
  return {
    ipHash: hashIp(ip, secret),
    userAgentHash: userAgent ? hashIdentifier(userAgent, secret) : null,
  };
}

async function record(
  ctx: AuthContext,
  event: string,
  options: { email?: string | null; userId?: string | null } = {},
) {
  try {
    const secret = getServerEnv().BETTER_AUTH_SECRET;
    const hashes = contextHashes(ctx);
    await insertAuthEvent({
      userId: options.userId ?? null,
      identifierHash: options.email ? hashIdentifier(options.email, secret) : null,
      event,
      requestId: requestId(ctx),
      ipHash: hashes.ipHash,
      userAgentHash: hashes.userAgentHash,
    });
  } catch {
    // A failed security-log write must not turn a successful sign-in into a
    // crash. It is reported without any identifier or credential.
    console.error("[auth] a security event could not be recorded");
  }
}

/**
 * Enforces the same freshness rule as Better Auth's own
 * `freshSessionMiddleware` for an endpoint that omits it.
 *
 * `POST /link-social` is a credential mutation: it makes a third-party identity
 * an accepted way into the account. `better-auth@1.7.12` protects
 * `/unlink-account` with `freshSessionMiddleware` but guards `/link-social` with
 * the plain `sessionMiddleware`, so a stolen old session could add an attacker
 * identity instead of being forced to re-authenticate. The endpoint is on the
 * public Better Auth router, so gating only the server action would not be a
 * permission check.
 */
async function requireFreshSession(ctx: AuthContext): Promise<void> {
  const session = await getSessionFromCtx(
    ctx as unknown as Parameters<typeof getSessionFromCtx>[0],
  );
  if (!session?.session) {
    throw new APIError("UNAUTHORIZED", { message: "Unauthorized", code: "UNAUTHORIZED" });
  }

  const freshAge = ctx.context.sessionConfig?.freshAge;
  if (!freshAge) return;

  const createdAt = new Date(session.session.createdAt).getTime();
  if (Date.now() - createdAt >= freshAge * 1000) {
    throw new APIError("FORBIDDEN", {
      message: "Session is not fresh",
      code: "SESSION_NOT_FRESH",
    });
  }
}

/**
 * Better Auth lifecycle hooks (official `createAuthMiddleware` API).
 *
 * The hooks are the one place where a failed sign-in is counted and where the
 * non-tenant authentication event is recorded. They never log a password, a
 * token, a reset URL, an email address, or a raw IP.
 */
export const authHooks = {
  before: createAuthMiddleware(async (rawCtx) => {
    const ctx = rawCtx as unknown as AuthContext;
    if (ctx.path === "/link-social") {
      await requireFreshSession(ctx);
      return;
    }
    if (ctx.path !== "/sign-in/email") return;
    const email = bodyEmail(ctx.body);
    if (!email) return;

    if (await isAccountLocked(email)) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many attempts. Try again shortly.",
      });
    }
  }),

  after: createAuthMiddleware(async (rawCtx) => {
    const ctx = rawCtx as unknown as AuthContext;
    const failed = ctx.context.returned instanceof APIError;

    switch (ctx.path) {
      case "/sign-in/email": {
        const email = bodyEmail(ctx.body);
        if (failed) {
          if (!email) return;
          try {
            const hashes = contextHashes(ctx);
            await recordSignInFailure(email, {
              requestId: requestId(ctx),
              ipHash: hashes.ipHash,
              userAgentHash: hashes.userAgentHash,
            });
            if (await isAccountLocked(email)) {
              await record(ctx, AUTH_EVENTS.lockedOut, { email });
            }
          } catch {
            console.error("[auth] a failed sign-in could not be recorded");
          }
          return;
        }
        await record(ctx, AUTH_EVENTS.signedIn, {
          email,
          userId: ctx.context.newSession?.user?.id ?? null,
        });
        return;
      }
      case "/sign-up/email": {
        if (failed) return;
        await record(ctx, AUTH_EVENTS.signedUp, {
          email: bodyEmail(ctx.body),
          userId: ctx.context.newSession?.user?.id ?? null,
        });
        return;
      }
      case "/sign-out": {
        if (failed) return;
        await record(ctx, AUTH_EVENTS.signedOut, {
          userId: ctx.context.session?.user?.id ?? null,
        });
        return;
      }
      case "/send-verification-email": {
        if (failed) return;
        await record(ctx, AUTH_EVENTS.verificationSent, { email: bodyEmail(ctx.body) });
        return;
      }
      case "/verify-email": {
        if (failed) return;
        await record(ctx, AUTH_EVENTS.emailVerified, {
          userId: ctx.context.newSession?.user?.id ?? null,
        });
        return;
      }
      case "/request-password-reset": {
        if (failed) return;
        await record(ctx, AUTH_EVENTS.resetRequested, { email: bodyEmail(ctx.body) });
        return;
      }
      default:
        return;
    }
  }),
};

/**
 * Called from Better Auth's `onPasswordReset` callback, which is the first
 * point where the account is known. The after hook for the reset endpoint does
 * not run with a session, so the actor is recorded here instead.
 */
export async function recordPasswordReset(
  user: { id: string; email: string },
  request?: Request,
): Promise<void> {
  try {
    const secret = getServerEnv().BETTER_AUTH_SECRET;
    const headers = request?.headers ?? new Headers();
    const agent = headers.get("user-agent");
    await insertAuthEvent({
      userId: user.id,
      identifierHash: hashIdentifier(user.email, secret),
      event: AUTH_EVENTS.passwordReset,
      requestId: headers.get("x-request-id") ?? newRequestId(),
      ipHash: hashIp(firstForwardedIp(headers), secret),
      userAgentHash: agent ? hashIdentifier(agent, secret) : null,
    });
  } catch {
    console.error("[auth] the password-reset event could not be recorded");
  }
}
