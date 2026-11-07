-- The public upload route records a respondent file with `scope = 'form_upload'`
-- (`src/app/api/forms/public/[formId]/upload/route.ts`). The value was added to
-- `prisma/schema.prisma` but the previous migration never added it to the
-- PostgreSQL enum, so the insert would fail with an invalid enum value.
ALTER TYPE "file_scope" ADD VALUE IF NOT EXISTS 'form_upload';
