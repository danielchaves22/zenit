import { AppKey, PrismaClient, Role } from '@prisma/client';
import AppAccessService from './app-access.service';
import CompanyService from './company.service';
import FinancialStructureService from './financial-structure.service';
import { normalizeTimeZone } from '../utils/time-zone';

const prisma = new PrismaClient();

type PersonalWorkspaceResult = {
  companyId: number;
  name: string;
  created: boolean;
  timeZone: string | null;
};

type SelectedCompanyResult = {
  companyId: number;
  name: string;
  timeZone: string | null;
};

export default class PersonalWorkspaceService {
  static async getOrCreateForUser(
    userId: number,
    deviceTimeZone?: string | null
  ): Promise<PersonalWorkspaceResult> {
    const requestedTimeZone = normalizeTimeZone(deviceTimeZone);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        personalWorkspaceOwned: {
          select: {
            id: true,
            name: true,
            timeZone: true
          }
        },
        companies: {
          select: {
            companyId: true
          }
        }
      }
    });

    if (!user) {
      throw new Error('Usuario nao encontrado');
    }

    if (user.personalWorkspaceOwned) {
      const timeZone = await this.ensureWorkspaceTimeZone(
        user.personalWorkspaceOwned.id,
        user.personalWorkspaceOwned.timeZone,
        requestedTimeZone
      );
      await this.ensureWorkspaceAccess(user.id, user.personalWorkspaceOwned.id);
      return {
        companyId: user.personalWorkspaceOwned.id,
        name: user.personalWorkspaceOwned.name,
        created: false,
        timeZone
      };
    }

    const existingLinkedWorkspace = await prisma.company.findFirst({
      where: {
        isPersonalWorkspace: true,
        personalWorkspaceOwnerId: user.id
      },
      select: {
        id: true,
        name: true,
        timeZone: true
      }
    });

    if (existingLinkedWorkspace) {
      const timeZone = await this.ensureWorkspaceTimeZone(
        existingLinkedWorkspace.id,
        existingLinkedWorkspace.timeZone,
        requestedTimeZone
      );
      await this.ensureWorkspaceAccess(user.id, existingLinkedWorkspace.id);
      return {
        companyId: existingLinkedWorkspace.id,
        name: existingLinkedWorkspace.name,
        created: false,
        timeZone
      };
    }

    const workspaceName = this.buildWorkspaceName(user.name);
    const companyId = await this.createWorkspaceWithRetry(
      user.id,
      workspaceName,
      user.companies.length === 0,
      requestedTimeZone
    );

    return {
      companyId,
      name: workspaceName,
      created: true,
      timeZone: requestedTimeZone
    };
  }

  static async selectExistingCashCompanyForUser(
    userId: number,
    companyId: number
  ): Promise<SelectedCompanyResult> {
    const membership = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            timeZone: true
          }
        }
      }
    });

    if (!membership) {
      throw new Error('Usuario nao pertence a empresa informada');
    }

    const hasCashAccess = await AppAccessService.hasEffectiveAccess(
      userId,
      companyId,
      AppKey.ZENIT_CASH
    );

    if (!hasCashAccess) {
      throw new Error('Usuario sem acesso efetivo ao Zenit Cash nesta empresa');
    }

    return {
      companyId: membership.company.id,
      name: membership.company.name,
      timeZone: membership.company.timeZone
    };
  }

  private static buildWorkspaceName(userName: string): string {
    const trimmed = userName.trim();
    return trimmed ? `Workspace pessoal de ${trimmed}` : 'Workspace pessoal';
  }

  private static async createWorkspaceWithRetry(
    userId: number,
    workspaceName: string,
    isDefault: boolean,
    timeZone?: string | null
  ): Promise<number> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const code = await CompanyService.nextCode();
        const company = await prisma.company.create({
          data: {
            name: workspaceName,
            code,
            isPersonalWorkspace: true,
            personalWorkspaceOwnerId: userId,
            timeZone: timeZone ?? null
          }
        });

        await this.ensureWorkspaceAccess(userId, company.id, isDefault);
        await FinancialStructureService.ensureFinancialStructure(company.id);

        return company.id;
      } catch (error) {
        if (attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error('Nao foi possivel criar workspace pessoal');
  }

  private static async ensureWorkspaceTimeZone(
    companyId: number,
    currentTimeZone: string | null,
    requestedTimeZone: string | null
  ): Promise<string | null> {
    if (currentTimeZone || !requestedTimeZone) {
      return currentTimeZone;
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        timeZone: requestedTimeZone
      },
      select: {
        timeZone: true
      }
    });

    return updated.timeZone;
  }

  private static async ensureWorkspaceAccess(
    userId: number,
    companyId: number,
    isDefault = false
  ): Promise<void> {
    await prisma.userCompany.upsert({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      },
      update: {
        role: Role.SUPERUSER,
        isCompanyOwner: true,
        manageFinancialAccounts: true,
        manageFinancialCategories: true
      },
      create: {
        userId,
        companyId,
        role: Role.SUPERUSER,
        isDefault,
        isCompanyOwner: true,
        manageFinancialAccounts: true,
        manageFinancialCategories: true
      }
    });

    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_CASH, enabled: true },
      { appKey: AppKey.ZENIT_CALC, enabled: false },
      { appKey: AppKey.ZENIT_ADMIN, enabled: false }
    ]);

    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true },
      { appKey: AppKey.ZENIT_CALC, granted: false },
      { appKey: AppKey.ZENIT_ADMIN, granted: false }
    ]);
  }
}
