import { Role } from '@prisma/client';
import {
  canAccessWorkspacePlanning,
  getWorkspacePlanningCapabilities
} from '../../src/policies/workspace-planning-access.policy';

describe('workspace planning access policy', () => {
  it.each([Role.ADMIN, Role.SUPERUSER, Role.USER])(
    'allows %s members to read shared planning data',
    (role) => {
      expect(canAccessWorkspacePlanning({ role }, 'READ')).toBe(true);
    }
  );

  it.each([Role.ADMIN, Role.SUPERUSER])(
    'allows %s members to manage shared planning data',
    (role) => {
      expect(canAccessWorkspacePlanning({ role }, 'MANAGE')).toBe(true);
    }
  );

  it('allows the workspace owner to manage and denies an ordinary member', () => {
    expect(
      getWorkspacePlanningCapabilities({ role: Role.USER, isCompanyOwner: true })
    ).toEqual({ canRead: true, canManage: true });
    expect(getWorkspacePlanningCapabilities({ role: Role.USER })).toEqual({
      canRead: true,
      canManage: false
    });
  });
});
