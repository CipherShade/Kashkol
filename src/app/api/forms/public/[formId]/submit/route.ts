import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { headers } from "next/headers";
import { formSubmissionQuerySchema, submitFormResponseSchema } from "@/modules/forms/schemas";
import { submitFormResponsePublic } from "@/modules/forms/service";
import { findFormDetailByPublicId } from "@/modules/forms/repository";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    // Verify origin for CSRF protection
    await assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);

    const { formId } = await context.params;
    const body = await request.json();
    const input = submitFormResponseSchema.parse(body);

    // Use the dedicated public submission service
    // This handles: form lookup, publication check, submission mode validation,
    // answer validation, conditional logic, file validation, duplicate detection,
    // and audit logging - all without requiring workspace authorization
    const result = await submitFormResponsePublic(formId, input, { requestId });

    return NextResponse.json(result, {
      status: 201,
      headers: {
        "x-request-id": requestId,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    // Verify origin for CSRF protection
    await assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);

    const { formId } = await context.params;

    // Parse query parameters
    const url = new URL(request.url);
    const parsed = formSubmissionQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: parsed.error.flatten().fieldErrors,
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    // Get the form detail using public scope lookup
    const form = await findFormDetailByPublicId(formId);

    if (!form) {
      // Don't reveal whether the form exists or belongs to another tenant
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            messageKey: "errors.formNotFound",
            requestId,
          },
        },
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }

    // Check that the form is published and accepting responses
    if (form.status !== "published" || !form.acceptingResponses || form.archivedAt) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            messageKey: "errors.formNotAcceptingResponses",
            requestId,
          },
        },
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }

    // Return form details for public viewing
    return NextResponse.json(
      {
        form: {
          id: form.id,
          title: form.title,
          description: form.description,
          status: form.status,
          submissionMode: form.submissionMode,
          isPublic: form.isPublic,
          publicSlug: form.publicSlug,
          acceptingResponses: form.acceptingResponses,
          confirmationMessage: form.confirmationMessage ?? null,
          settings: form.settingsJson,
          sections: form.sections,
          questions: form.questions,
          logicRules: form.logicRules,
          createdAt: form.createdAt,
          publishedAt: form.publishedAt,
        },
      },
      {
        headers: {
          "x-request-id": requestId,
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}