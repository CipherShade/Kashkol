-- F-P3-10: truthful student performance intelligence.
--
-- Derived measures, trends, topics, risks, and class intelligence remain
-- computed from source rows (ADR-0007, ADR-0034). This migration adds only the
-- facts the teacher explicitly records: topic labels on online questions,
-- manual paper-exam topic observations, risk acknowledgements, and notes that
-- are explicitly shareable with a parent.

ALTER TABLE "workspace_settings"
    ADD COLUMN "performance_risk_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN "performance_risk_min_assessments" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "performance_risk_average_below_percent" INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN "performance_risk_consecutive_declines" INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN "performance_risk_weak_topic_percent" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "workspace_settings"
    ADD CONSTRAINT "workspace_settings_performance_risk_min_assessments_check"
      CHECK ("performance_risk_min_assessments" BETWEEN 2 AND 20),
    ADD CONSTRAINT "workspace_settings_performance_risk_average_below_percent_check"
      CHECK ("performance_risk_average_below_percent" BETWEEN 1 AND 100),
    ADD CONSTRAINT "workspace_settings_performance_risk_consecutive_declines_check"
      CHECK ("performance_risk_consecutive_declines" BETWEEN 1 AND 10),
    ADD CONSTRAINT "workspace_settings_performance_risk_weak_topic_percent_check"
      CHECK ("performance_risk_weak_topic_percent" BETWEEN 1 AND 100);

ALTER TABLE "online_exam_question"
    ADD COLUMN "topic" TEXT;

CREATE TYPE "performance_risk_status" AS ENUM ('acknowledged', 'resolved');

CREATE TABLE "assessment_topic_result" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "correct_count" INTEGER NOT NULL,
    "incorrect_count" INTEGER NOT NULL,
    "note" TEXT,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_topic_result_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_topic_result_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
    CONSTRAINT "assessment_topic_result_assessment_student_topic_key"
      UNIQUE ("assessment_id", "student_id", "topic"),
    CONSTRAINT "assessment_topic_result_counts_check"
      CHECK ("correct_count" >= 0 AND "incorrect_count" >= 0)
);

ALTER TABLE "assessment_topic_result"
    ADD CONSTRAINT "assessment_topic_result_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "assessment_topic_result_workspace_id_assessment_id_fkey"
      FOREIGN KEY ("workspace_id", "assessment_id") REFERENCES "assessment"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "assessment_topic_result_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "assessment_topic_result_workspace_id_idx"
    ON "assessment_topic_result"("workspace_id");
CREATE INDEX "assessment_topic_result_student_id_idx"
    ON "assessment_topic_result"("student_id");
CREATE INDEX "assessment_topic_result_assessment_id_idx"
    ON "assessment_topic_result"("assessment_id");
CREATE INDEX "assessment_topic_result_workspace_id_topic_idx"
    ON "assessment_topic_result"("workspace_id", "topic");

ALTER TABLE "assessment_topic_result" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_topic_result" FORCE ROW LEVEL SECURITY;
CREATE POLICY "assessment_topic_result_tenant_isolation" ON "assessment_topic_result"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "performance_risk_state" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "risk_key" TEXT NOT NULL,
    "status" "performance_risk_status" NOT NULL DEFAULT 'acknowledged',
    "note" TEXT,
    "follow_up_id" UUID,
    "acknowledged_by" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_risk_state_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "performance_risk_state_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
    CONSTRAINT "performance_risk_state_workspace_id_risk_key_key" UNIQUE ("workspace_id", "risk_key")
);

ALTER TABLE "performance_risk_state"
    ADD CONSTRAINT "performance_risk_state_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "performance_risk_state_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "performance_risk_state_workspace_id_follow_up_id_fkey"
      FOREIGN KEY ("workspace_id", "follow_up_id") REFERENCES "student_follow_up"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "performance_risk_state_workspace_id_idx"
    ON "performance_risk_state"("workspace_id");
CREATE INDEX "performance_risk_state_student_id_idx"
    ON "performance_risk_state"("student_id");
CREATE INDEX "performance_risk_state_workspace_id_status_idx"
    ON "performance_risk_state"("workspace_id", "status");
CREATE INDEX "performance_risk_state_follow_up_id_idx"
    ON "performance_risk_state"("follow_up_id");

ALTER TABLE "performance_risk_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "performance_risk_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "performance_risk_state_tenant_isolation" ON "performance_risk_state"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "performance_report_note" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_report_note_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "performance_report_note_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
    CONSTRAINT "performance_report_note_body_check" CHECK (length(btrim("body")) > 0)
);

ALTER TABLE "performance_report_note"
    ADD CONSTRAINT "performance_report_note_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "performance_report_note_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "performance_report_note_workspace_id_idx"
    ON "performance_report_note"("workspace_id");
CREATE INDEX "performance_report_note_student_id_created_at_idx"
    ON "performance_report_note"("student_id", "created_at");

ALTER TABLE "performance_report_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "performance_report_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "performance_report_note_tenant_isolation" ON "performance_report_note"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "assessment_topic_result" TO kashkol_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "performance_risk_state" TO kashkol_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "performance_report_note" TO kashkol_app;
  END IF;
END $$;
