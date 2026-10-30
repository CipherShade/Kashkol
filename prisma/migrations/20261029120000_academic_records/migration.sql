CREATE TYPE "homework_status" AS ENUM ('active', 'archived');
CREATE TYPE "homework_submission_status" AS ENUM ('not_submitted', 'submitted', 'late', 'excused');
CREATE TYPE "assessment_type" AS ENUM ('paper_exam', 'quiz', 'test', 'other');
CREATE TYPE "assessment_result_status" AS ENUM ('graded', 'missing', 'excused', 'not_taken');
CREATE TYPE "follow_up_status" AS ENUM ('open', 'resolved');
CREATE TYPE "follow_up_outcome" AS ENUM ('contacted', 'no_answer', 'monitoring', 'no_action', 'other');

ALTER TABLE "assessment"
  ADD COLUMN "type" "assessment_type" NOT NULL DEFAULT 'paper_exam',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "extra_credit_allowance" DECIMAL(6,2);
ALTER TABLE "assessment"
  ADD CONSTRAINT "assessment_extra_credit_allowance_check"
  CHECK ("extra_credit_allowance" IS NULL OR "extra_credit_allowance" >= 0);

ALTER TABLE "assessment_score"
  ADD COLUMN "status" "assessment_result_status" NOT NULL DEFAULT 'missing',
  ADD COLUMN "note" TEXT;
UPDATE "assessment_score" SET "status" = 'graded' WHERE "score" IS NOT NULL;
ALTER TABLE "assessment_score"
  ADD CONSTRAINT "assessment_score_status_check"
  CHECK (("status" = 'graded' AND "score" IS NOT NULL) OR ("status" <> 'graded' AND "score" IS NULL));

CREATE TABLE "homework" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "due_at" TIMESTAMPTZ(6) NOT NULL,
  "max_score" DECIMAL(6,2),
  "status" "homework_status" NOT NULL DEFAULT 'active',
  "created_by" TEXT NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "homework_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homework_score_check" CHECK ("max_score" IS NULL OR "max_score" > 0)
);

CREATE TABLE "homework_submission" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "homework_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "status" "homework_submission_status" NOT NULL DEFAULT 'not_submitted',
  "teacher_feedback" TEXT,
  "score" DECIMAL(6,2),
  "updated_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "homework_submission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homework_submission_score_check" CHECK ("score" IS NULL OR "score" >= 0)
);

CREATE TABLE "homework_resource" (
  "workspace_id" UUID NOT NULL,
  "homework_id" UUID NOT NULL,
  "file_id" UUID NOT NULL,
  CONSTRAINT "homework_resource_pkey" PRIMARY KEY ("homework_id", "file_id")
);

CREATE TABLE "student_follow_up" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "due_at" TIMESTAMPTZ(6),
  "status" "follow_up_status" NOT NULL DEFAULT 'open',
  "outcome" "follow_up_outcome",
  "resolved_at" TIMESTAMPTZ(6),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "student_follow_up_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_follow_up_resolution_check"
    CHECK (("status" = 'open' AND "resolved_at" IS NULL) OR ("status" = 'resolved' AND "resolved_at" IS NOT NULL))
);

CREATE TABLE "student_follow_up_event" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "follow_up_id" UUID NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "actor_display_name" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "outcome" "follow_up_outcome",
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_follow_up_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "homework_workspace_id_id_key" ON "homework"("workspace_id", "id");
CREATE INDEX "homework_workspace_id_due_at_idx" ON "homework"("workspace_id", "due_at");
CREATE INDEX "homework_group_id_status_idx" ON "homework"("group_id", "status");
CREATE UNIQUE INDEX "homework_submission_workspace_id_id_key" ON "homework_submission"("workspace_id", "id");
CREATE UNIQUE INDEX "homework_submission_homework_id_student_id_key" ON "homework_submission"("homework_id", "student_id");
CREATE INDEX "homework_submission_workspace_id_student_id_idx" ON "homework_submission"("workspace_id", "student_id");
CREATE INDEX "homework_submission_homework_id_status_idx" ON "homework_submission"("homework_id", "status");
CREATE INDEX "homework_resource_workspace_id_idx" ON "homework_resource"("workspace_id");
CREATE UNIQUE INDEX "student_follow_up_workspace_id_id_key" ON "student_follow_up"("workspace_id", "id");
CREATE INDEX "student_follow_up_workspace_id_status_due_at_idx" ON "student_follow_up"("workspace_id", "status", "due_at");
CREATE INDEX "student_follow_up_student_id_created_at_idx" ON "student_follow_up"("student_id", "created_at");
CREATE UNIQUE INDEX "student_follow_up_event_workspace_id_id_key" ON "student_follow_up_event"("workspace_id", "id");
CREATE INDEX "student_follow_up_event_follow_up_id_created_at_idx" ON "student_follow_up_event"("follow_up_id", "created_at");
CREATE INDEX "student_follow_up_event_workspace_id_idx" ON "student_follow_up_event"("workspace_id");

ALTER TABLE "homework" ADD CONSTRAINT "homework_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework" ADD CONSTRAINT "homework_workspace_id_group_id_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_submission" ADD CONSTRAINT "homework_submission_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_submission" ADD CONSTRAINT "homework_submission_workspace_id_homework_id_fkey"
  FOREIGN KEY ("workspace_id", "homework_id") REFERENCES "homework"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_submission" ADD CONSTRAINT "homework_submission_workspace_id_student_id_fkey"
  FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_resource" ADD CONSTRAINT "homework_resource_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_resource" ADD CONSTRAINT "homework_resource_workspace_id_homework_id_fkey"
  FOREIGN KEY ("workspace_id", "homework_id") REFERENCES "homework"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_resource" ADD CONSTRAINT "homework_resource_workspace_id_file_id_fkey"
  FOREIGN KEY ("workspace_id", "file_id") REFERENCES "file"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_follow_up" ADD CONSTRAINT "student_follow_up_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_follow_up" ADD CONSTRAINT "student_follow_up_workspace_id_student_id_fkey"
  FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_follow_up" ADD CONSTRAINT "student_follow_up_workspace_id_owner_user_id_fkey"
  FOREIGN KEY ("workspace_id", "owner_user_id") REFERENCES "workspace_member"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_follow_up_event" ADD CONSTRAINT "student_follow_up_event_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_follow_up_event" ADD CONSTRAINT "student_follow_up_event_workspace_id_follow_up_id_fkey"
  FOREIGN KEY ("workspace_id", "follow_up_id") REFERENCES "student_follow_up"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "check_assessment_score"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  maximum numeric(6,2);
  allowance numeric(6,2);
  is_locked TIMESTAMPTZ(6);
BEGIN
  SELECT "max_score", COALESCE("extra_credit_allowance", 0), "locked_at"
    INTO maximum, allowance, is_locked
    FROM "assessment"
   WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."assessment_id"
   FOR UPDATE;
  IF is_locked IS NOT NULL THEN
    RAISE EXCEPTION 'assessment marks are locked';
  END IF;
  IF NEW."score" IS NULL THEN
    RETURN NEW;
  END IF;
  IF maximum IS NOT NULL AND NEW."score" > maximum + allowance THEN
    RAISE EXCEPTION 'assessment score exceeds the configured maximum';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "check_homework_score"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  maximum numeric(6,2);
BEGIN
  IF NEW."score" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "max_score" INTO maximum
    FROM "homework"
   WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."homework_id";
  IF maximum IS NULL OR NEW."score" > maximum THEN
    RAISE EXCEPTION 'homework score exceeds the configured maximum';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "homework_submission_score_check"
  BEFORE INSERT OR UPDATE ON "homework_submission"
  FOR EACH ROW EXECUTE FUNCTION "check_homework_score"();

CREATE OR REPLACE FUNCTION "check_homework_maximum"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "homework_submission"
     WHERE "workspace_id" = NEW."workspace_id"
       AND "homework_id" = NEW."id"
       AND "score" IS NOT NULL
       AND (NEW."max_score" IS NULL OR "score" > NEW."max_score")
  ) THEN
    RAISE EXCEPTION 'homework maximum is below an existing score';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "homework_maximum_check"
  BEFORE UPDATE OF "max_score" ON "homework"
  FOR EACH ROW EXECUTE FUNCTION "check_homework_maximum"();

ALTER TABLE "homework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_tenant_isolation" ON "homework"
  USING ("workspace_id" = current_workspace_id())
  WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "homework_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_submission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_submission_tenant_isolation" ON "homework_submission"
  USING ("workspace_id" = current_workspace_id())
  WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "homework_resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_resource" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_resource_tenant_isolation" ON "homework_resource"
  USING ("workspace_id" = current_workspace_id())
  WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "student_follow_up" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_follow_up" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_follow_up_tenant_isolation" ON "student_follow_up"
  USING ("workspace_id" = current_workspace_id())
  WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "student_follow_up_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_follow_up_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_follow_up_event_tenant_isolation" ON "student_follow_up_event"
  USING ("workspace_id" = current_workspace_id())
  WITH CHECK ("workspace_id" = current_workspace_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "homework", "homework_submission", "homework_resource", "student_follow_up", "student_follow_up_event"
TO kashkol_app;
