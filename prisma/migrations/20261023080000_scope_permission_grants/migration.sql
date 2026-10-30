-- A permission grant must point at a member of the same workspace.
--
-- RLS on permission_grant.workspace_id alone cannot enforce this: a buggy or
-- malicious writer could set workspace_id to its own workspace while pointing
-- member_id at another workspace's member. The composite foreign key makes that
-- impossible at the database boundary.
ALTER TABLE "permission_grant" DROP CONSTRAINT "permission_grant_member_id_fkey";

ALTER TABLE "workspace_member"
  ADD CONSTRAINT "workspace_member_workspace_id_id_key" UNIQUE ("workspace_id", "id");

ALTER TABLE "permission_grant"
  ADD CONSTRAINT "permission_grant_workspace_id_member_id_fkey"
  FOREIGN KEY ("workspace_id", "member_id")
  REFERENCES "workspace_member"("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
