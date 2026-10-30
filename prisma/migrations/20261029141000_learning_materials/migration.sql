ALTER TYPE "file_scope" RENAME VALUE 'personal' TO 'teacher_only';
ALTER TYPE "file_scope" RENAME VALUE 'group' TO 'groups';
ALTER TYPE "file_scope" RENAME VALUE 'student' TO 'students';

ALTER TABLE "file" RENAME COLUMN "display_name" TO "title";
ALTER TABLE "file"
    ADD COLUMN "description" TEXT,
    ADD COLUMN "subject_id" UUID,
    ADD COLUMN "topic" TEXT,
    ADD COLUMN "archived_at" TIMESTAMPTZ(6);

CREATE TABLE "file_group_access" (
    "workspace_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,

    CONSTRAINT "file_group_access_pkey" PRIMARY KEY ("workspace_id", "file_id", "group_id")
);

CREATE TABLE "file_student_access" (
    "workspace_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,

    CONSTRAINT "file_student_access_pkey" PRIMARY KEY ("workspace_id", "file_id", "student_id")
);

INSERT INTO "file_group_access" ("workspace_id", "file_id", "group_id")
SELECT "workspace_id", "id", "group_id"
FROM "file"
WHERE "scope" = 'groups' AND "group_id" IS NOT NULL;

INSERT INTO "file_student_access" ("workspace_id", "file_id", "student_id")
SELECT "workspace_id", "id", "student_id"
FROM "file"
WHERE "scope" = 'students' AND "student_id" IS NOT NULL;

ALTER TABLE "file"
    ADD CONSTRAINT "file_workspace_id_subject_id_fkey"
    FOREIGN KEY ("workspace_id", "subject_id")
    REFERENCES "subject"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "file_group_access"
    ADD CONSTRAINT "file_group_access_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "file_group_access_workspace_id_file_id_fkey"
    FOREIGN KEY ("workspace_id", "file_id") REFERENCES "file"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "file_group_access_workspace_id_group_id_fkey"
    FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "file_student_access"
    ADD CONSTRAINT "file_student_access_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "file_student_access_workspace_id_file_id_fkey"
    FOREIGN KEY ("workspace_id", "file_id") REFERENCES "file"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "file_student_access_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "file_workspace_id_subject_id_idx" ON "file"("workspace_id", "subject_id");
CREATE INDEX "file_group_access_workspace_id_group_id_idx" ON "file_group_access"("workspace_id", "group_id");
CREATE INDEX "file_student_access_workspace_id_student_id_idx" ON "file_student_access"("workspace_id", "student_id");

ALTER TABLE "file_group_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_group_access" FORCE ROW LEVEL SECURITY;
CREATE POLICY "file_group_access_tenant_isolation" ON "file_group_access"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "file_student_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_student_access" FORCE ROW LEVEL SECURITY;
CREATE POLICY "file_student_access_tenant_isolation" ON "file_student_access"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "file_group_access", "file_student_access"
    TO kashkol_app;
  END IF;
END $$;
