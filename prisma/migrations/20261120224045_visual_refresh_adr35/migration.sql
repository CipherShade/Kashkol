/*
  Warnings:

  - You are about to drop the `report_export_queue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "permission_grant" DROP CONSTRAINT "permission_grant_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "report_export_queue" DROP CONSTRAINT "report_export_queue_report_fkey";

-- DropIndex
DROP INDEX "file_scope_group_id_idx";

-- DropIndex
DROP INDEX "file_scope_student_id_idx";

-- DropIndex
DROP INDEX "group_phonetic_key_trgm_idx";

-- DropIndex
DROP INDEX "group_search_key_trgm_idx";

-- DropIndex
DROP INDEX "student_phonetic_key_trgm_idx";

-- DropIndex
DROP INDEX "student_search_key_trgm_idx";

-- DropIndex
DROP INDEX "subject_phonetic_key_trgm_idx";

-- DropIndex
DROP INDEX "subject_search_key_trgm_idx";

-- AlterTable
ALTER TABLE "academic_term" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "assessment_topic_result" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "form" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "form_answer" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "form_question" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "form_question_logic" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "form_question_option" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "form_section" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "form_submission" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "group" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "group_schedule_slot" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "homework_completion_mark" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "online_exam" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "online_exam_attempt" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "online_exam_question" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "performance_report_note" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "performance_risk_state" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform_admin" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "portal_invitation" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "portal_login" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "portal_push_subscription" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "session_attendee" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "video_lesson" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspace_invitation" ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "report_export_queue";

-- CreateIndex
CREATE INDEX "file_workspace_id_archived_at_idx" ON "file"("workspace_id", "archived_at");

-- CreateIndex
CREATE INDEX "message_outbox_idempotency_key_idx" ON "message_outbox"("idempotency_key");

-- RenameForeignKey
ALTER TABLE "fee_rule" RENAME CONSTRAINT "fee_rule_workspace_group_fkey" TO "fee_rule_workspace_id_group_id_fkey";

-- RenameForeignKey
ALTER TABLE "fee_rule" RENAME CONSTRAINT "fee_rule_workspace_student_fkey" TO "fee_rule_workspace_id_student_id_fkey";

-- RenameForeignKey
ALTER TABLE "payment_adjustment" RENAME CONSTRAINT "payment_adjustment_workspace_payment_student_fkey" TO "payment_adjustment_workspace_id_payment_id_student_id_fkey";

-- RenameForeignKey
ALTER TABLE "payment_adjustment" RENAME CONSTRAINT "payment_adjustment_workspace_student_fkey" TO "payment_adjustment_workspace_id_student_id_fkey";

-- RenameIndex
ALTER INDEX "assessment_topic_result_assessment_student_topic_key" RENAME TO "assessment_topic_result_assessment_id_student_id_topic_key";

-- RenameIndex
ALTER INDEX "group_schedule_slot_workspace_id_weekday_startTime_idx" RENAME TO "group_schedule_slot_workspace_id_weekday_start_time_idx";

-- RenameIndex
ALTER INDEX "portal_push_subscription_workspace_id_portal_user_id_endpoint_k" RENAME TO "portal_push_subscription_workspace_id_portal_user_id_endpoi_key";
