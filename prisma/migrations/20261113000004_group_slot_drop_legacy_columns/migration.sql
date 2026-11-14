-- Migration: 20261113000004_group_slot_drop_legacy_columns
--
-- `20261113000003_group_schedule_slots` copied each group's room and capacity
-- into its new schedule slots. The group-level `room` and `capacity` columns
-- are therefore duplicated truth and are dropped here. Slots are the only
-- scheduling/room/capacity source from now on (ADR-0029).

ALTER TABLE "group" DROP COLUMN "room";
ALTER TABLE "group" DROP COLUMN "capacity";
