import { findActiveMemberships } from "@/modules/identity/repository";

export async function getWorkspaceIdForUser(userId: string): Promise<string | null> {
  const memberships = await findActiveMemberships(userId);
  return memberships[0]?.workspaceId ?? null;
}
