/**
 * Public form scope - doesn't require a workspace
 * This is a special scope for public forms that don't belong to any workspace
 */
export type PublicScope = {
  workspaceId: null; // Public forms don't have a workspace
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorType: "user";
  isPublic: true;
};

/**
 * Creates a public scope from the given data
 */
export function publicScope(input: {
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorType: "user";
  isPublic: true;
}): PublicScope {
  return {
    workspaceId: null,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    actorType: input.actorType,
    isPublic: input.isPublic,
  };
}