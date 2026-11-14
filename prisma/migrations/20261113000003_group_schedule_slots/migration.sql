-- Migration: 20261113000003_group_schedule_slots
--
-- supersedes decision D-03 ("a group carries a recurring weekly slot").
-- A group may now meet several times a week: this migration introduces
-- `group_schedule_slot` (one row per weekday/start-time pair, carrying its
-- own room and capacity) and drops the single-slot columns from `group`.
--
-- Existing groups are migrated with one slot per group; no data is lost.
-- RLS follows the standard tenant-isolation pattern (ADR-0006).

-- ---------------------------------------------------------------------------
-- 1. New table: group_schedule_slot
-- ---------------------------------------------------------------------------
CREATE TABLE "group_schedule_slot" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID        NOT NULL,
    "group_id"     UUID        NOT NULL,
    "weekday"      INTEGER     NOT NULL,
    "start_time"   TIME(0)     NOT NULL,
    "end_time"     TIME(0),
    "room"         TEXT,
    "capacity"     INTEGER,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "group_schedule_slot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "group_schedule_slot"
  ADD CONSTRAINT "group_schedule_slot_workspace_id_fkey"
  FOREIGN KEY ("workspace_id")
  REFERENCES "workspace" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Composite FK: the slot cannot point at a group of another workspace
ALTER TABLE "group_schedule_slot"
  ADD CONSTRAINT "group_schedule_slot_workspace_id_group_id_fkey"
  FOREIGN KEY ("workspace_id", "group_id")
  REFERENCES "group" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "group_schedule_slot_workspace_id_id_key"
  ON "group_schedule_slot" ("workspace_id", "id");

CREATE INDEX "group_schedule_slot_workspace_id_idx"
  ON "group_schedule_slot" ("workspace_id");

CREATE INDEX "group_schedule_slot_workspace_id_group_id_idx"
  ON "group_schedule_slot" ("workspace_id", "group_id");

CREATE INDEX "group_schedule_slot_workspace_id_weekday_startTime_idx"
  ON "group_schedule_slot" ("workspace_id", "weekday", "start_time");

-- ---------------------------------------------------------------------------
-- 2. Copy existing single slots; then drop the old columns from `group`
-- ---------------------------------------------------------------------------
INSERT INTO "group_schedule_slot"
  ("id", "workspace_id", "group_id", "weekday", "start_time", "end_time", "room", "capacity", "created_at", "updated_at")
SELECT gen_random_uuid(), "workspace_id", "id", "weekday", "start_time", "end_time", "room", "capacity", now(), now()
FROM "group";

ALTER TABLE "group" DROP COLUMN "weekday";
ALTER TABLE "group" DROP COLUMN "start_time";
ALTER TABLE "group" DROP COLUMN "end_time";

-- ---------------------------------------------------------------------------
-- 3. Row-level security (ADR-0006) + application-role grants
-- ---------------------------------------------------------------------------
ALTER TABLE "group_schedule_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_schedule_slot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "group_schedule_slot_tenant_isolation" ON "group_schedule_slot"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "group_schedule_slot" TO kashkol_app;
