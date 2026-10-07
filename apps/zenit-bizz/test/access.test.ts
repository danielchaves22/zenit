import { describe, expect, it } from 'vitest';
import { allowedCompanies, User } from '@/lib/types';
import { computeEffectiveAppAccess } from '@zenit/shared-users-core';

describe('Bizz company access', () => {
  it('requires both company enablement and an individual grant', () => {
    const result = computeEffectiveAppAccess(
      1,
      2,
      [{ companyId: 2, appKey: 'zenit-bizz', enabled: true }],
      []
    );
    expect(result.find((item) => item.appKey === 'zenit-bizz')?.allowed).toBe(false);
    expect(
      computeEffectiveAppAccess(
        1,
        2,
        [],
        [{ userId: 1, companyId: 2, appKey: 'zenit-bizz', granted: true }]
      ).find((item) => item.appKey === 'zenit-bizz')?.allowed
    ).toBe(false);
  });
  it('does not infer Bizz access from Cash access or administrator role', () => {
    const user: User = {
      id: 1,
      name: 'Teste',
      email: 'test@example.test',
      mustChangePassword: false,
      companies: [
        { id: 1, name: 'A', role: 'ADMIN', isDefault: true },
        { id: 2, name: 'B', role: 'USER', isDefault: false }
      ],
      appAccessByCompany: {
        1: [{ appKey: 'zenit-cash', enabled: true, granted: true, allowed: true }],
        2: [{ appKey: 'zenit-bizz', enabled: true, granted: true, allowed: true }]
      }
    };
    expect(allowedCompanies(user).map((item) => item.id)).toEqual([2]);
  });
});
