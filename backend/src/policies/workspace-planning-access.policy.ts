import { Role } from '@prisma/client';

export type WorkspacePlanningAction = 'READ' | 'MANAGE';

export type WorkspacePlanningActor = {
  role: Role;
  isCompanyOwner?: boolean;
};

export type WorkspacePlanningCapabilities = {
  canRead: boolean;
  canManage: boolean;
};

export function getWorkspacePlanningCapabilities(
  actor: WorkspacePlanningActor
): WorkspacePlanningCapabilities {
  return {
    canRead: true,
    canManage:
      actor.role === Role.ADMIN ||
      actor.role === Role.SUPERUSER ||
      actor.isCompanyOwner === true
  };
}

export function canAccessWorkspacePlanning(
  actor: WorkspacePlanningActor,
  action: WorkspacePlanningAction
): boolean {
  const capabilities = getWorkspacePlanningCapabilities(actor);
  return action === 'READ' ? capabilities.canRead : capabilities.canManage;
}
