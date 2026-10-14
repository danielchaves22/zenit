jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: {
  whatsAppUserBinding: { findUnique: jest.fn(), update: jest.fn() }, userCompany: { findMany: jest.fn() }
} }));
jest.mock('../../src/services/app-access.service', () => ({ __esModule: true, default: { hasEffectiveAccess: jest.fn() } }));
jest.mock('../../src/services/user.service', () => ({ __esModule: true, default: { getUserCompanyContext: jest.fn() } }));
import prisma from '../../src/lib/prisma';
import Access from '../../src/services/app-access.service';
import Users from '../../src/services/user.service';
import Workspaces from '../../src/services/hub-workspace.service';
import { AppKey } from '@prisma/client';
const db = prisma as any;
describe('authorized Hub workspace selection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.whatsAppUserBinding.findUnique.mockResolvedValue({ id: 7, userId: 2, activeCompanyId: 3, waId: 'alice' });
    db.userCompany.findMany.mockResolvedValue([3, 4, 5].map(id => ({ company: { id, name: `Workspace ${id}`, isPersonalWorkspace: id === 3 } })));
    jest.mocked(Access.hasEffectiveAccess).mockImplementation(async (_user, company, app) => company !== 5 && !(company === 4 && app === AppKey.ZENIT_CASH));
    jest.mocked(Users.getUserCompanyContext).mockImplementation(async (_user, company) => [3,4].includes(company) ? { role: 'ADMIN' } as any : null as any);
  });
  it('lists only memberships with channel access and distinguishes app permissions', async () => {
    const status = await Workspaces.list('alice');
    expect(db.userCompany.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 2 } }));
    expect(status.workspaces.map(w => w.id)).toEqual([3,4]);
    expect(status.workspaces[1]).toMatchObject({ cash: false, bizz: true });
    expect(status.workspace).toMatchObject({ id: 3, reference: '7:3' });
  });
  it('rejects inaccessible IDs instead of selecting the first available workspace', async () => {
    await expect(Workspaces.select('alice', 5)).rejects.toThrow('permissão');
    await expect(Workspaces.select('alice', 99)).rejects.toThrow('permissão');
    expect(db.whatsAppUserBinding.update).not.toHaveBeenCalled();
    await Workspaces.select('alice', 4);
    expect(db.whatsAppUserBinding.update).toHaveBeenCalledWith({ where: { id: 7, waId: 'alice' }, data: { activeCompanyId: 4 } });
  });
  it('permits explicit Cash context independently of active selection and rejects Bizz-only access', async () => {
    db.whatsAppUserBinding.findUnique.mockResolvedValue({ id: 7, userId: 2, activeCompanyId: 4, waId: 'alice' });
    expect(await Workspaces.authorizeCash('alice')).toBeNull();
    expect((await Workspaces.authorizeCash('alice', 3))?.binding.activeCompanyId).toBe(3);
    expect(await Workspaces.authorizeCash('alice', 99)).toBeNull();
    expect(db.whatsAppUserBinding.update).not.toHaveBeenCalled();
  });
  it('does not silently switch when the active workspace loses access', async () => {
    db.whatsAppUserBinding.findUnique.mockResolvedValue({ id: 7, userId: 2, activeCompanyId: 5, waId: 'alice' });
    const status = await Workspaces.list('alice');
    expect(status.connected).toBe(false); expect(status.workspace).toBeNull();
    expect(status.workspaces).toHaveLength(2);
  });
});
