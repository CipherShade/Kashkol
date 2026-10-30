-- Core domain schema, session activity, and authentication events.
--
-- This migration also installs the Arabic search normaliser and the trigram
-- indexes used by scoped search. Every tenant table gets its `workspace_id`
-- column, index, and RLS policy in this same migration (ARCHITECTURE.md §19).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

/*
 * `current_setting(name, true)` returns an empty string after a transaction
 * resets a transaction-local setting, not NULL. Casting '' to uuid raises
 * 22P02, which would make a legitimate self-scoped read fail. This helper makes
 * every policy treat "no workspace in scope" as NULL, which matches no rows.
 */
CREATE OR REPLACE FUNCTION "current_workspace_id"()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

-- The policies created by the earlier migrations used the raw cast. Redefine
-- them here so the whole schema shares the safe helper.
ALTER POLICY "workspace_tenant_isolation" ON "workspace"
  USING ("id" = "current_workspace_id"())
  WITH CHECK ("id" = "current_workspace_id"());
ALTER POLICY "workspace_settings_tenant_isolation" ON "workspace_settings"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());
ALTER POLICY "workspace_member_tenant_isolation" ON "workspace_member"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());
ALTER POLICY "permission_grant_tenant_isolation" ON "permission_grant"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());
ALTER POLICY "onboarding_task_tenant_isolation" ON "onboarding_task"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());
ALTER POLICY "audit_event_tenant_isolation" ON "audit_event"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());
ALTER POLICY "student_tenant_isolation" ON "student"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());
ALTER POLICY "portal_grant_tenant_isolation" ON "portal_grant"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "session_status" AS ENUM ('scheduled', 'completed', 'cancelled');
CREATE TYPE "attendance_mark_value" AS ENUM ('present', 'absent', 'late', 'excused');
CREATE TYPE "attendance_source" AS ENUM ('manual', 'qr');
CREATE TYPE "payment_method" AS ENUM ('cash', 'transfer', 'other');
CREATE TYPE "file_scope" AS ENUM ('personal', 'group', 'student');
CREATE TYPE "scan_status" AS ENUM ('pending', 'clean', 'blocked');

-- ---------------------------------------------------------------------------
-- Authentication support tables (not tenant-scoped)
-- ---------------------------------------------------------------------------

CREATE TABLE "session_activity" (
    "session_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_activity_pkey" PRIMARY KEY ("session_id")
);

CREATE TABLE "auth_event" (
    "id" UUID NOT NULL,
    "user_id" TEXT,
    "identifier_hash" TEXT,
    "event" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_event_identifier_hash_created_at_idx"
    ON "auth_event"("identifier_hash", "created_at");
CREATE INDEX "auth_event_user_id_created_at_idx"
    ON "auth_event"("user_id", "created_at");
CREATE INDEX "auth_event_created_at_idx" ON "auth_event"("created_at");

ALTER TABLE "session_activity"
    ADD CONSTRAINT "session_activity_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "session"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Arabic search normalisation
-- ---------------------------------------------------------------------------

/*
 * Conservative fold: strip tatweel and diacritics, unify the alef/ya/ta-marbuta
 * variants, map Arabic-Indic digits to ASCII, collapse whitespace, and lower.
 * Teacher-authored free text remains stored exactly as entered (DM-12); this
 * function only feeds the derived `search_key` columns.
 */
CREATE OR REPLACE FUNCTION "normalize_arabic"("input" TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT btrim(
    lower(
      regexp_replace(
        translate(
          translate("input", 'ـًٌٍَُِّْٰٕٓٔ', ''),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹أإآٱىةؤئک',
          '01234567890123456789اااايهويک'
        ),
        '\s+', ' ', 'g'
      )
    )
  )
$$;

/*
 * A deliberately fuzzy phonetic key. It maps the emphatic and pharyngeal
 * consonants that Egyptians commonly interchange when writing names, and
 * collapses hamza. It is a search aid, never a stored truth: two different
 * names may share a key, and the caller always shows the real stored spelling.
 */
CREATE OR REPLACE FUNCTION "phonetic_arabic"("input" TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace("normalize_arabic"("input"), 'ء', ''),
                    'ع', 'ا'
                  ),
                  'ح', 'ه'
                ),
                'خ', 'ه'
              ),
              'ط', 'ت'
            ),
            'ص', 'س'
          ),
          'ض', 'د'
        ),
        'ظ', 'د'
      ),
      'ذ', 'د'
    ),
    'ث', 'س'
  )
$$;

-- ---------------------------------------------------------------------------
-- Teaching content
-- ---------------------------------------------------------------------------

CREATE TABLE "subject" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "search_key" TEXT,
    "phonetic_key" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "subject_id" UUID,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "room" TEXT,
    "color" TEXT NOT NULL DEFAULT 'indigo',
    "weekday" INTEGER NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0),
    "teacher_note" TEXT,
    "search_key" TEXT,
    "phonetic_key" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollment" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------

CREATE TABLE "teaching_session" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "status" "session_status" NOT NULL DEFAULT 'scheduled',
    "is_one_off" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teaching_session_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

CREATE TABLE "attendance_mark" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mark" "attendance_mark_value" NOT NULL,
    "source" "attendance_source" NOT NULL DEFAULT 'manual',
    "device_id" TEXT,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_mark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_revision" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attendance_mark_id" UUID NOT NULL,
    "old_mark" "attendance_mark_value",
    "new_mark" "attendance_mark_value" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT,
    "batch_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_revision_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------

CREATE TABLE "assessment" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "max_score" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "locked_at" TIMESTAMPTZ(6),
    "unlock_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_score" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "score" DECIMAL(6,2),
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessment_score_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "method" "payment_method" NOT NULL,
    "paid_on" DATE NOT NULL,
    "note" TEXT,
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_revision" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_revision_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------

CREATE TABLE "file" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope" "file_scope" NOT NULL,
    "group_id" UUID,
    "student_id" UUID,
    "display_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "scan_status" "scan_status" NOT NULL DEFAULT 'pending',
    "uploaded_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Student search columns
-- ---------------------------------------------------------------------------

ALTER TABLE "student" ADD COLUMN "search_key" TEXT;
ALTER TABLE "student" ADD COLUMN "phonetic_key" TEXT;

-- ---------------------------------------------------------------------------
-- Unique constraints used by composite tenant foreign keys
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "subject_workspace_id_id_key" ON "subject"("workspace_id", "id");
CREATE UNIQUE INDEX "group_workspace_id_id_key" ON "group"("workspace_id", "id");
CREATE UNIQUE INDEX "enrollment_workspace_id_id_key" ON "enrollment"("workspace_id", "id");
CREATE UNIQUE INDEX "teaching_session_workspace_id_id_key" ON "teaching_session"("workspace_id", "id");
CREATE UNIQUE INDEX "attendance_mark_workspace_id_id_key" ON "attendance_mark"("workspace_id", "id");
CREATE UNIQUE INDEX "attendance_revision_workspace_id_id_key" ON "attendance_revision"("workspace_id", "id");
CREATE UNIQUE INDEX "assessment_workspace_id_id_key" ON "assessment"("workspace_id", "id");
CREATE UNIQUE INDEX "assessment_score_workspace_id_id_key" ON "assessment_score"("workspace_id", "id");
CREATE UNIQUE INDEX "payment_workspace_id_id_key" ON "payment"("workspace_id", "id");
CREATE UNIQUE INDEX "payment_revision_workspace_id_id_key" ON "payment_revision"("workspace_id", "id");
CREATE UNIQUE INDEX "file_workspace_id_id_key" ON "file"("workspace_id", "id");

-- A student belongs to a group at most once at a time; the partial index keeps
-- two open enrolments from existing while preserving the closed history.
CREATE UNIQUE INDEX "enrollment_open_unique"
    ON "enrollment"("group_id", "student_id") WHERE "left_at" IS NULL;

CREATE UNIQUE INDEX "student_workspace_phone_unique"
    ON "student"("workspace_id", "phone_e164") WHERE "phone_e164" IS NOT NULL;

CREATE UNIQUE INDEX "attendance_mark_session_id_student_id_key"
    ON "attendance_mark"("session_id", "student_id");
CREATE UNIQUE INDEX "assessment_score_assessment_id_student_id_key"
    ON "assessment_score"("assessment_id", "student_id");
CREATE UNIQUE INDEX "file_storage_key_key" ON "file"("storage_key");

-- ---------------------------------------------------------------------------
-- Foreign keys (every child uses the composite (workspace_id, id) reference so
-- a row in workspace A cannot point at a row in workspace B)
-- ---------------------------------------------------------------------------

ALTER TABLE "subject" ADD CONSTRAINT "subject_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group" ADD CONSTRAINT "group_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group" ADD CONSTRAINT "group_workspace_id_subject_id_fkey"
    FOREIGN KEY ("workspace_id", "subject_id") REFERENCES "subject"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_workspace_id_group_id_fkey"
    FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teaching_session" ADD CONSTRAINT "teaching_session_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_session" ADD CONSTRAINT "teaching_session_workspace_id_group_id_fkey"
    FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_workspace_id_session_id_fkey"
    FOREIGN KEY ("workspace_id", "session_id") REFERENCES "teaching_session"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_revision" ADD CONSTRAINT "attendance_revision_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_revision" ADD CONSTRAINT "attendance_revision_workspace_id_session_id_fkey"
    FOREIGN KEY ("workspace_id", "session_id") REFERENCES "teaching_session"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_revision" ADD CONSTRAINT "attendance_revision_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_revision" ADD CONSTRAINT "attendance_revision_workspace_id_attendance_mark_id_fkey"
    FOREIGN KEY ("workspace_id", "attendance_mark_id") REFERENCES "attendance_mark"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment" ADD CONSTRAINT "assessment_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_workspace_id_group_id_fkey"
    FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_score" ADD CONSTRAINT "assessment_score_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_score" ADD CONSTRAINT "assessment_score_workspace_id_assessment_id_fkey"
    FOREIGN KEY ("workspace_id", "assessment_id") REFERENCES "assessment"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_score" ADD CONSTRAINT "assessment_score_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment" ADD CONSTRAINT "payment_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment" ADD CONSTRAINT "payment_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_revision" ADD CONSTRAINT "payment_revision_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_revision" ADD CONSTRAINT "payment_revision_workspace_id_payment_id_fkey"
    FOREIGN KEY ("workspace_id", "payment_id") REFERENCES "payment"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "file" ADD CONSTRAINT "file_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file" ADD CONSTRAINT "file_workspace_id_group_id_fkey"
    FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file" ADD CONSTRAINT "file_workspace_id_student_id_fkey"
    FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "group" ADD CONSTRAINT "group_weekday_check"
    CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "group" ADD CONSTRAINT "group_time_check"
    CHECK ("end_time" IS NULL OR "start_time" < "end_time");
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_time_check"
    CHECK ("left_at" IS NULL OR "left_at" >= "enrolled_at");
ALTER TABLE "teaching_session" ADD CONSTRAINT "teaching_session_time_check"
    CHECK ("ends_at" IS NULL OR "starts_at" < "ends_at");
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_max_score_check"
    CHECK ("max_score" > 0);
ALTER TABLE "assessment_score" ADD CONSTRAINT "assessment_score_non_negative_check"
    CHECK ("score" IS NULL OR "score" >= 0);
ALTER TABLE "payment" ADD CONSTRAINT "payment_amount_check"
    CHECK ("amount_minor" > 0);
ALTER TABLE "payment" ADD CONSTRAINT "payment_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "payment" ADD CONSTRAINT "payment_period_check"
    CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "file" ADD CONSTRAINT "file_scope_check"
    CHECK (
        ("scope" = 'personal' AND "group_id" IS NULL AND "student_id" IS NULL)
        OR ("scope" = 'group' AND "group_id" IS NOT NULL AND "student_id" IS NULL)
        OR ("scope" = 'student' AND "student_id" IS NOT NULL AND "group_id" IS NULL)
    );
ALTER TABLE "file" ADD CONSTRAINT "file_size_check"
    CHECK ("size_bytes" > 0 AND "size_bytes" <= 26214400);
ALTER TABLE "student" ADD CONSTRAINT "student_phone_e164_check"
    CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "student" ADD CONSTRAINT "student_parent_phone_e164_check"
    CHECK ("parent_phone_e164" IS NULL OR "parent_phone_e164" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_action_check"
    CHECK ("action" <> '');

CREATE OR REPLACE FUNCTION "check_assessment_score"()
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
    FROM "assessment"
   WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."assessment_id";
  IF maximum IS NOT NULL AND NEW."score" > maximum THEN
    RAISE EXCEPTION 'assessment score exceeds the maximum score';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assessment_score_max_check"
    BEFORE INSERT OR UPDATE ON "assessment_score"
    FOR EACH ROW EXECUTE FUNCTION "check_assessment_score"();

-- ---------------------------------------------------------------------------
-- Derived Arabic search keys
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "set_student_search_key"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."search_key" := "normalize_arabic"(coalesce(NEW."first_name", '') || ' ' || coalesce(NEW."last_name", ''));
  NEW."phonetic_key" := "phonetic_arabic"(NEW."search_key");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "set_named_search_key"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."search_key" := "normalize_arabic"(coalesce(NEW."name", ''));
  NEW."phonetic_key" := "phonetic_arabic"(NEW."search_key");
  RETURN NEW;
END;
$$;

CREATE TRIGGER "student_search_key_trigger"
    BEFORE INSERT OR UPDATE OF "first_name", "last_name" ON "student"
    FOR EACH ROW EXECUTE FUNCTION "set_student_search_key"();

CREATE TRIGGER "subject_search_key_trigger"
    BEFORE INSERT OR UPDATE OF "name" ON "subject"
    FOR EACH ROW EXECUTE FUNCTION "set_named_search_key"();

CREATE TRIGGER "group_search_key_trigger"
    BEFORE INSERT OR UPDATE OF "name" ON "group"
    FOR EACH ROW EXECUTE FUNCTION "set_named_search_key"();

UPDATE "student"
   SET "search_key" = "normalize_arabic"(coalesce("first_name", '') || ' ' || coalesce("last_name", '')),
       "phonetic_key" = "phonetic_arabic"("normalize_arabic"(coalesce("first_name", '') || ' ' || coalesce("last_name", '')));

-- ---------------------------------------------------------------------------
-- Search indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "student_search_key_trgm_idx"
    ON "student" USING GIN ("search_key" gin_trgm_ops);
CREATE INDEX "student_phonetic_key_trgm_idx"
    ON "student" USING GIN ("phonetic_key" gin_trgm_ops);
CREATE INDEX "subject_search_key_trgm_idx"
    ON "subject" USING GIN ("search_key" gin_trgm_ops);
CREATE INDEX "subject_phonetic_key_trgm_idx"
    ON "subject" USING GIN ("phonetic_key" gin_trgm_ops);
CREATE INDEX "group_search_key_trgm_idx"
    ON "group" USING GIN ("search_key" gin_trgm_ops);
CREATE INDEX "group_phonetic_key_trgm_idx"
    ON "group" USING GIN ("phonetic_key" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Query indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "subject_workspace_id_idx" ON "subject"("workspace_id");
CREATE INDEX "subject_workspace_id_archived_at_idx" ON "subject"("workspace_id", "archived_at");
CREATE INDEX "group_workspace_id_idx" ON "group"("workspace_id");
CREATE INDEX "group_workspace_id_archived_at_idx" ON "group"("workspace_id", "archived_at");
CREATE INDEX "group_workspace_id_weekday_start_time_idx"
    ON "group"("workspace_id", "weekday", "start_time");
CREATE INDEX "enrollment_workspace_id_idx" ON "enrollment"("workspace_id");
CREATE INDEX "enrollment_student_id_idx" ON "enrollment"("student_id");
CREATE INDEX "enrollment_group_id_student_id_idx" ON "enrollment"("group_id", "student_id");
CREATE INDEX "teaching_session_workspace_id_idx" ON "teaching_session"("workspace_id");
CREATE INDEX "teaching_session_group_id_starts_at_idx" ON "teaching_session"("group_id", "starts_at");
CREATE INDEX "teaching_session_workspace_id_starts_at_idx" ON "teaching_session"("workspace_id", "starts_at");
CREATE INDEX "attendance_mark_workspace_id_idx" ON "attendance_mark"("workspace_id");
CREATE INDEX "attendance_mark_student_id_idx" ON "attendance_mark"("student_id");
CREATE INDEX "attendance_revision_workspace_id_idx" ON "attendance_revision"("workspace_id");
CREATE INDEX "attendance_revision_attendance_mark_id_created_at_idx"
    ON "attendance_revision"("attendance_mark_id", "created_at");
CREATE INDEX "assessment_workspace_id_idx" ON "assessment"("workspace_id");
CREATE INDEX "assessment_workspace_id_date_idx" ON "assessment"("workspace_id", "date");
CREATE INDEX "assessment_score_workspace_id_idx" ON "assessment_score"("workspace_id");
CREATE INDEX "assessment_score_student_id_idx" ON "assessment_score"("student_id");
CREATE INDEX "payment_workspace_id_idx" ON "payment"("workspace_id");
CREATE INDEX "payment_student_id_period_idx" ON "payment"("student_id", "period");
CREATE INDEX "payment_workspace_id_voided_at_idx" ON "payment"("workspace_id", "voided_at");
CREATE INDEX "payment_revision_workspace_id_idx" ON "payment_revision"("workspace_id");
CREATE INDEX "payment_revision_payment_id_created_at_idx"
    ON "payment_revision"("payment_id", "created_at");
CREATE INDEX "file_workspace_id_idx" ON "file"("workspace_id");
CREATE INDEX "file_scope_group_id_idx" ON "file"("scope", "group_id");
CREATE INDEX "file_scope_student_id_idx" ON "file"("scope", "student_id");
CREATE INDEX "file_workspace_id_scan_status_idx" ON "file"("workspace_id", "scan_status");
CREATE INDEX "student_workspace_id_archived_at_idx" ON "student"("workspace_id", "archived_at");

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE "subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subject" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subject_tenant_isolation" ON "subject"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group" FORCE ROW LEVEL SECURITY;
CREATE POLICY "group_tenant_isolation" ON "group"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "enrollment_tenant_isolation" ON "enrollment"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "teaching_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teaching_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teaching_session_tenant_isolation" ON "teaching_session"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "attendance_mark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_mark" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_mark_tenant_isolation" ON "attendance_mark"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "attendance_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_revision_tenant_isolation" ON "attendance_revision"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "assessment_tenant_isolation" ON "assessment"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "assessment_score" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_score" FORCE ROW LEVEL SECURITY;
CREATE POLICY "assessment_score_tenant_isolation" ON "assessment_score"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_tenant_isolation" ON "payment"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "payment_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_revision_tenant_isolation" ON "payment_revision"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "file" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file" FORCE ROW LEVEL SECURITY;
CREATE POLICY "file_tenant_isolation" ON "file"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

-- A signed-in user may discover their own memberships before a workspace id is
-- known. This is a SELECT-only policy; writes still require the tenant scope.
CREATE POLICY "workspace_member_self_read" ON "workspace_member"
    FOR SELECT
    USING ("user_id" = current_setting('app.user_id', true));

-- A portal user may discover the grants that link them to student records. The
-- same policy is SELECT-only; it never grants workspace-wide access.
CREATE POLICY "portal_grant_self_read" ON "portal_grant"
    FOR SELECT
    USING ("portal_user_id" = current_setting('app.user_id', true));

-- ---------------------------------------------------------------------------
-- Application role privileges
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "subject", "group", "enrollment", "teaching_session",
      "attendance_mark", "assessment", "assessment_score",
      "payment", "file"
    TO kashkol_app;

    -- Revision chains are append-only, like the audit log.
    GRANT SELECT, INSERT ON TABLE "attendance_revision", "payment_revision" TO kashkol_app;
    REVOKE UPDATE, DELETE ON TABLE "attendance_revision", "payment_revision" FROM kashkol_app;

    GRANT SELECT, INSERT ON TABLE "auth_event" TO kashkol_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "session_activity" TO kashkol_app;

    GRANT EXECUTE ON FUNCTION "normalize_arabic"(TEXT) TO kashkol_app;
    GRANT EXECUTE ON FUNCTION "phonetic_arabic"(TEXT) TO kashkol_app;
    GRANT EXECUTE ON FUNCTION "current_workspace_id"() TO kashkol_app;
  END IF;
END $$;
