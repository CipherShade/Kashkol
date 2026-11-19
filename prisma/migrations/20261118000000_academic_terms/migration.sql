-- F-P3-07 AC-1: academic terms with start/end dates, per workspace and per grade.
-- A NULL grade means the term is workspace-wide; a grade-specific term overrides
-- the workspace-wide term for that grade (F-P3-07 AC-2). Overlap is rejected by
-- the service inside the scoped transaction; the date order is enforced here.
CREATE TABLE "academic_term" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_term_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_term_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
    CONSTRAINT "academic_term_dates_check" CHECK ("end_date" >= "start_date")
);

ALTER TABLE "academic_term"
    ADD CONSTRAINT "academic_term_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "academic_term_workspace_id_grade_idx"
    ON "academic_term"("workspace_id", "grade");
CREATE INDEX "academic_term_workspace_id_start_date_idx"
    ON "academic_term"("workspace_id", "start_date");

ALTER TABLE "academic_term" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_term" FORCE ROW LEVEL SECURITY;
CREATE POLICY "academic_term_tenant_isolation" ON "academic_term"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academic_term" TO kashkol_app;
  END IF;
END $$;
