-- The learning-materials migration pinned `file_scope_check` to the three
-- original scopes. A public form respondent file is recorded with
-- `scope = 'form_upload'` and has no group or student target, so the old
-- constraint rejects it. Extend the constraint without relaxing the existing
-- invariants for teacher-only, group, and student files.
ALTER TABLE "file" DROP CONSTRAINT "file_scope_check";

ALTER TABLE "file" ADD CONSTRAINT "file_scope_check" CHECK (
  (("scope" = 'teacher_only'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
  OR (("scope" = 'groups'::"file_scope") AND "group_id" IS NOT NULL AND "student_id" IS NULL)
  OR (("scope" = 'students'::"file_scope") AND "student_id" IS NOT NULL AND "group_id" IS NULL)
  OR (("scope" = 'form_upload'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
);
