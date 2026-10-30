-- Persist teacher-only student notes and group capacity. Capacity was formerly
-- encoded in teacher_note by an incomplete UI and must never share that field.

ALTER TABLE "group" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "group" ADD CONSTRAINT "group_capacity_check"
    CHECK ("capacity" IS NULL OR ("capacity" >= 1 AND "capacity" <= 500));

CREATE TABLE "student_note" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_note_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_note_workspace_id_id_key" ON "student_note"("workspace_id", "id");
CREATE INDEX "student_note_workspace_id_idx" ON "student_note"("workspace_id");
CREATE INDEX "student_note_student_id_created_at_idx" ON "student_note"("student_id", "created_at");

ALTER TABLE "student_note" ADD CONSTRAINT "student_note_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_note_tenant_isolation" ON "student_note"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT ON TABLE "student_note" TO kashkol_app;
    REVOKE UPDATE, DELETE ON TABLE "student_note" FROM kashkol_app;
  END IF;
END $$;
