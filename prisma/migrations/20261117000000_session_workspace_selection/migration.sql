-- F-P2-08: bind the active workspace to the server session. The pointer lives
-- on the existing per-session activity row; the Better Auth-owned `session`
-- table is not altered. A null pointer keeps the P1 earliest-membership fallback.
ALTER TABLE "session_activity" ADD COLUMN "active_workspace_id" UUID;

CREATE INDEX "session_activity_active_workspace_id_idx" ON "session_activity"("active_workspace_id");
