import type { NextRequest } from "next/server";
import { getVerifiedSession } from "@/modules/identity/session";
import { AppError } from "@/lib/http/errors";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export type SessionContext = {
  user: SessionUser;
  session: { id: string };
};

export async function requireSession(
  request?: NextRequest | Request,
): Promise<SessionContext> {
  const requestHeaders = request && "headers" in request ? request.headers : undefined;
  const result = await getVerifiedSession(requestHeaders as Headers | undefined);
  if (!result) {
    throw new AppError("UNAUTHORIZED");
  }

  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      emailVerified: result.user.emailVerified,
    },
    session: { id: result.session.id },
  };
}

export async function getSession(
  request?: NextRequest | Request,
): Promise<SessionContext | null> {
  const requestHeaders = request && "headers" in request ? request.headers : undefined;
  const result = await getVerifiedSession(requestHeaders as Headers | undefined);
  if (!result) return null;

  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      emailVerified: result.user.emailVerified,
    },
    session: { id: result.session.id },
  };
}
