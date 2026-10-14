import prisma from '../lib/prisma';
import { AppKey } from '@prisma/client';
import AppAccessService from './app-access.service';
import UserService from './user.service';

/** Workspace IDs select a context, never grant access to it. */
export default class HubWorkspaceService {
  static async list(waId: string) {
    const binding = await prisma.whatsAppUserBinding.findUnique({ where: { waId } });
    if (!binding) return { connected: false, workspace: null, workspaces: [] };
    const memberships = await prisma.userCompany.findMany({
      where: { userId: binding.userId }, include: { company: true }, orderBy: { companyId: 'asc' }
    });
    const allowed = await Promise.all(memberships.map(async ({ company }) => {
      const [channel, cash, bizz] = await Promise.all([
        AppAccessService.hasEffectiveAccess(binding.userId, company.id, AppKey.ZENIT_WHATSAPP),
        AppAccessService.hasEffectiveAccess(binding.userId, company.id, AppKey.ZENIT_CASH),
        AppAccessService.hasEffectiveAccess(binding.userId, company.id, AppKey.ZENIT_BIZZ)
      ]);
      return channel && (cash || bizz) ? { id: company.id, name: company.name,
        personal: company.isPersonalWorkspace, reference: `${binding.id}:${company.id}`, cash, bizz } : null;
    }));
    const workspaces = allowed.filter((w): w is NonNullable<typeof w> => w !== null);
    const workspace = workspaces.find(w => w.id === binding.activeCompanyId) ?? null;
    return { connected: workspace?.cash === true, workspace, workspaces };
  }

  static async select(waId: string, workspaceId: number) {
    const status = await this.list(waId);
    const workspace = status.workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace ausente ou sem permissão.');
    const bindingId = Number(workspace.reference.split(':')[0]);
    // The original binding must still exist. A concurrent reconnect cannot inherit this selection.
    await prisma.whatsAppUserBinding.update({ where: { id: bindingId, waId }, data: { activeCompanyId: workspaceId } });
    return { workspace };
  }

  static async authorizeCash(waId: string, workspaceId?: number) {
    const binding = await prisma.whatsAppUserBinding.findUnique({ where: { waId } });
    if (!binding) return null;
    const id = workspaceId ?? binding.activeCompanyId;
    const context = await UserService.getUserCompanyContext(binding.userId, id);
    if (!context || !await AppAccessService.hasEffectiveAccess(binding.userId, id, AppKey.ZENIT_WHATSAPP) ||
        !await AppAccessService.hasEffectiveAccess(binding.userId, id, AppKey.ZENIT_CASH)) return null;
    return { binding: { ...binding, activeCompanyId: id }, role: context.role };
  }

  static async description(binding: { id: number; activeCompanyId: number }) {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: binding.activeCompanyId },
      select: { id: true, name: true, isPersonalWorkspace: true } });
    return { id: company.id, name: company.name, personal: company.isPersonalWorkspace,
      reference: `${binding.id}:${company.id}` };
  }
}
