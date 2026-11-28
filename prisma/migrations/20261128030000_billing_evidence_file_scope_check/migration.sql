-- The billing migration added `billing_evidence` to the `file_scope` enum but
-- left `file_scope_check` pinned to the earlier scopes, so evidence upload was
-- rejected by the database. Rebuild the same check with the billing scope added;
-- no existing scope rule is weakened.
ALTER TABLE "file" DROP CONSTRAINT "file_scope_check";

ALTER TABLE "file" ADD CONSTRAINT "file_scope_check" CHECK (
  (("scope" = 'teacher_only'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
  OR (("scope" = 'groups'::"file_scope") AND "group_id" IS NOT NULL AND "student_id" IS NULL)
  OR (("scope" = 'students'::"file_scope") AND "student_id" IS NOT NULL AND "group_id" IS NULL)
  OR (("scope" = 'form_upload'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
  OR (("scope" = 'homework_submission'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
  OR (("scope" = 'billing_evidence'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
);
