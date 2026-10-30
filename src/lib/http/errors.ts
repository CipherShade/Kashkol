import { NextResponse } from "next/server";

export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    messageKey: string;
    fields?: Record<string, string[]>;
    requestId: string;
  };
};

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  EMAIL_NOT_VERIFIED: 403,
  INTERNAL: 500,
};

const DEFAULT_MESSAGE_KEY: Record<ErrorCode, string> = {
  UNAUTHORIZED: "errors.unauthorized",
  FORBIDDEN: "errors.forbidden",
  NOT_FOUND: "errors.notFound",
  VALIDATION_FAILED: "errors.validationFailed",
  CONFLICT: "errors.conflict",
  RATE_LIMITED: "errors.rateLimited",
  EMAIL_NOT_VERIFIED: "errors.emailNotVerified",
  INTERNAL: "errors.internal",
};

/**
 * A safe, typed failure. It never carries a raw database message, a stack
 * trace, or user content. `messageKey` is resolved by the client catalogue.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: ErrorCode,
    options: { messageKey?: string; fields?: Record<string, string[]> } = {},
  ) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.messageKey = options.messageKey ?? DEFAULT_MESSAGE_KEY[code];
    this.fields = options.fields;
  }
}

export function toApiErrorBody(error: unknown, requestId: string): ApiErrorBody {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        messageKey: error.messageKey,
        ...(error.fields ? { fields: error.fields } : {}),
        requestId,
      },
    };
  }

  return {
    error: {
      code: "INTERNAL",
      messageKey: DEFAULT_MESSAGE_KEY.INTERNAL,
      requestId,
    },
  };
}

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function errorResponse(error: unknown, requestId: string): NextResponse<ApiErrorBody> {
  const body = toApiErrorBody(error, requestId);
  return NextResponse.json(body, {
    status: statusForCode(body.error.code),
    headers: { "x-request-id": requestId },
  });
}
