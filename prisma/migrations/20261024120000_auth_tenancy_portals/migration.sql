-- CreateEnum
CREATE TYPE "portal_kind" AS ENUM ('parent', 'student');

-- CreateTable: rate_limit (Better Auth database-backed rate limiting)
CREATE TABLE "rate_limit" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rate_limit_key_idx" ON "rate_limit"("key");

-- CreateTable: student (Tenant-scoped student directory)
CREATE TABLE "student" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "grade" TEXT,
    "phone_e164" TEXT,
    "parent_name" TEXT,
    "parent_phone_e164" TEXT,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),
    "merged_into_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_workspace_id_id_key" ON "student"("workspace_id", "id");
CREATE INDEX "student_workspace_id_idx" ON "student"("workspace_id");

-- CreateTable: portal_grant (Parent and Student scoped links to student records)
CREATE TABLE "portal_grant" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "portal_user_id" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "kind" "portal_kind" NOT NULL,
    "issued_by" TEXT,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_grant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_grant_portal_user_id_student_id_kind_key" ON "portal_grant"("portal_user_id", "student_id", "kind");
CREATE UNIQUE INDEX "portal_grant_workspace_id_id_key" ON "portal_grant"("workspace_id", "id");
CREATE INDEX "portal_grant_workspace_id_idx" ON "portal_grant"("workspace_id");
CREATE INDEX "portal_grant_portal_user_id_idx" ON "portal_grant"("portal_user_id");

-- Foreign Keys
ALTER TABLE "student"
    ADD CONSTRAINT "student_workspace_id_fkey"
    FOREIGN KEY ("workspace_id")
    REFERENCES "workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_grant"
    ADD CONSTRAINT "portal_grant_workspace_id_fkey"
    FOREIGN KEY ("workspace_id")
    REFERENCES "workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_grant"
    ADD CONSTRAINT "portal_grant_portal_user_id_fkey"
    FOREIGN KEY ("portal_user_id")
    REFERENCES "user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite constraint ensures portal_grant in workspace A cannot link to student in workspace B
ALTER TABLE "portal_grant"
    ADD CONSTRAINT "portal_grant_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id")
    REFERENCES "student"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security (RLS)
ALTER TABLE "student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_tenant_isolation" ON "student"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "portal_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_grant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "portal_grant_tenant_isolation" ON "portal_grant"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

-- Application role privileges
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "rate_limit", "student", "portal_grant"
    TO kashkol_app;
  END IF;
END $$;
