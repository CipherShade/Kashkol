import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { REQUEST_ID_HEADER } from "@/lib/http/request-id";

export function billingValidationResponse(error: ZodError, requestId: string) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    fields[key] ??= [];
    fields[key].push(issue.message);
  }
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_FAILED",
        messageKey: "errors.validationFailed",
        fields,
        requestId,
      },
    },
    {
      status: 422,
      headers: { [REQUEST_ID_HEADER]: requestId },
    },
  );
}

export function billingJson(body: unknown, requestId: string, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
      "cache-control": "no-store",
    },
  });
}
