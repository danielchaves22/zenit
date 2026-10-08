import prisma from '../lib/prisma';
import { Request, Response } from 'express';
import { AppKey, Role } from '@prisma/client';
import UserService from '../services/user.service';
import { logger } from '../utils/logger';
import AppAccessService from '../services/app-access.service';
import { toPrismaAppKey } from '../constants/app-access';

type CompanyMembershipInput = {
  companyId: number;
  role: Role;
  isDefault?: boolean;
  isCompanyOwner?: boolean;
  manageFinancialAccounts?: boolean;
  manageFinancialCategories?: boolean;
};

function getUserContext(req: Request): {
  userId: number;
  role: Role;
  companyId: number;
  isCompanyOwner: boolean;
} {
  // @ts-ignore
  const { userId, role, companyId, isCompanyOwner } = req.user;

  return {
    userId: userId as number,
    role: role as Role,
    companyId: companyId as number,
    isCompanyOwner: Boolean(isCompanyOwner)
  };
}

function canManageCompanyOwnership(actor: {
  role: Role;
  isCompanyOwner: boolean;
}): boolean {
  return actor.role === 'ADMIN' || actor.isCompanyOwner;
}

function normalizeCompanyMemberships(companies: any[] | undefined): CompanyMembershipInput[] {
  if (!Array.isArray(companies)) {
    return [];
  }

  return companies.map((company) => ({
    companyId: Number(company.companyId),
    role: company.role as Role,
    isDefault: company.isDefault,
    isCompanyOwner: company.isCompanyOwner === true,
    manageFinancialAccounts: company.manageFinancialAccounts,
    manageFinancialCategories: company.manageFinancialCategories
  }));
}

function toAppGrantPayload(appGrants: any[] | undefined): Array<{
  companyId: number;
  appKey: AppKey;
  granted: boolean;
}> {
  if (!Array.isArray(appGrants)) {
    return [];
  }

  return appGrants
    .map((grant) => {
      const appKey = toPrismaAppKey(grant.appKey);
      if (!appKey) return null;

      return {
        companyId: Number(grant.companyId),
        appKey,
        granted: grant.granted !== false
      };
    })
    .filter((grant): grant is { companyId: number; appKey: AppKey; granted: boolean } => grant !== null);
}

function getBusinessErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (
    error.message.includes('Company owner') ||
    error.message.includes('ultimo company owner') ||
    error.message.includes('ja esta associado') ||
    error.message.includes('associado a uma empresa')
  ) {
    return 400;
  }

  return null;
}

export const createUser = async (req: Request, res: Response) => {
  const actor = getUserContext(req);
  const { role, companyId } = actor;
  const { email, password, name, newRole, companyId: targetCompanyId, companies, appGrants, platformAdmin } = req.body;
  const requestedCompanies = normalizeCompanyMemberships(companies);
  const mayManageOwnership = canManageCompanyOwnership(actor);

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password e name sao obrigatorios.' });
  }

  if (role === 'USER') {
    return res.status(403).json({ error: 'Acesso negado: USER nao pode criar usuarios.' });
  }

  if (platformAdmin !== undefined && !req.user.platformAdmin) {
    return res.status(403).json({ error: 'Apenas administradores do Zenit podem definir acesso à plataforma.' });
  }

  if (role === 'SUPERUSER' && newRole === 'ADMIN') {
    return res.status(403).json({
      error: 'SUPERUSER nao pode criar usuarios ADMIN.'
    });
  }

  let companiesToCreate: CompanyMembershipInput[] = [];
  const roleToAssign: Role =
    role === 'ADMIN'
      ? (newRole as Role || 'SUPERUSER')
      : newRole === 'SUPERUSER'
        ? 'SUPERUSER'
        : 'USER';

  if (role === 'SUPERUSER') {
    let targetId = targetCompanyId !== undefined ? Number(targetCompanyId) : undefined;
    let requestedCompany = requestedCompanies.length === 1 ? requestedCompanies[0] : undefined;

    if (targetId === undefined) {
      if (!requestedCompany) {
        return res.status(400).json({
          error: 'E necessario informar companyId ou companies com uma empresa.'
        });
      }

      targetId = requestedCompany.companyId;
    }

    if (companyId !== targetId) {
      return res.status(403).json({ error: 'SUPERUSER nao pode criar usuario em outra empresa.' });
    }

    if (requestedCompanies.some((company) => company.companyId !== companyId)) {
      return res.status(403).json({ error: 'SUPERUSER nao pode criar usuario em outra empresa.' });
    }

    if (!mayManageOwnership && requestedCompany?.isCompanyOwner) {
      return res.status(403).json({
        error: 'Apenas ADMIN ou company owner podem conceder company owner.'
      });
    }

    requestedCompany = requestedCompany ?? {
      companyId: targetId,
      role: roleToAssign
    };

    companiesToCreate.push({
      companyId: targetId,
      role: roleToAssign,
      isCompanyOwner: mayManageOwnership ? requestedCompany.isCompanyOwner ?? false : false,
      manageFinancialAccounts: requestedCompany.manageFinancialAccounts,
      manageFinancialCategories: requestedCompany.manageFinancialCategories
    });
  } else if (requestedCompanies.length > 0) {
    companiesToCreate = requestedCompanies;

  } else if (targetCompanyId !== undefined) {
    companiesToCreate.push({
      companyId: Number(targetCompanyId),
      role: roleToAssign,
      isCompanyOwner: false
    });
  } else if (!platformAdmin) {
    return res.status(400).json({ error: 'E necessario informar companies ou companyId.' });
  }

  const explicitGrants = toAppGrantPayload(appGrants);
  if (explicitGrants.some(grant => !companiesToCreate.some(company => company.companyId === grant.companyId))) {
    return res.status(403).json({ error: 'Permissões de aplicativos devem pertencer às empresas do usuário.' });
  }

  try {
    const created = await UserService.createUser({
      email,
      password,
      name,
      companies: companiesToCreate,
      platformAdmin
    });

    const grantsPayload =
      Array.isArray(appGrants)
        ? explicitGrants
        : await AppAccessService.buildDefaultGrantsForCompanies(
            companiesToCreate.map((company) => company.companyId)
          );

    if (grantsPayload.length > 0) {
      await AppAccessService.setUserGrantsForManyCompanies(created.id, grantsPayload);
    }

    return res.status(201).json(created);
  } catch (error) {
    logger.error('Erro ao criar usuario:', error);

    const status = getBusinessErrorStatus(error);
    if (status && error instanceof Error) {
      return res.status(status).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Erro interno ao criar usuario.' });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  const { role, companyId, userId: me } = getUserContext(req);

  let filterCompanyId: number | undefined;
  if (role === 'ADMIN' && req.query.companyId !== undefined) {
    const parsed = Number(req.query.companyId);
    if (isNaN(parsed)) {
      return res.status(400).json({ error: 'companyId invalido.' });
    }

    filterCompanyId = parsed;
  }

  try {
    let users;
    const baseSelect = {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        appGrants: {
          select: {
            companyId: true,
            granted: true,
            app: { select: { appKey: true } }
          }
        },
        companies: {
          select: {
            role: true,
            isDefault: true,
            isCompanyOwner: true,
            manageFinancialAccounts: true,
            manageFinancialCategories: true,
            company: { select: { id: true, name: true, code: true } }
          }
        }
      }
    };

    if (role === 'ADMIN') {
      users = await UserService.listUsers(baseSelect, filterCompanyId);
    } else if (role === 'SUPERUSER') {
      users = await UserService.listUsers(baseSelect, companyId);
    } else {
      users = await UserService.listUsers(
        {
          ...baseSelect,
          where: { id: me }
        },
        companyId
      );
    }

    return res.status(200).json(users);
  } catch (error) {
    logger.error('Erro ao listar usuarios:', error);
    return res.status(500).json({ error: 'Erro interno ao listar usuarios.' });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  const { role, companyId, userId: me } = getUserContext(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de usuario invalido.' });
  }

  try {
    const userExists = await UserService.userBelongsToCompany(id, companyId);

    if (role !== 'ADMIN' && !userExists) {
      return res.status(403).json({ error: 'Acesso negado a este usuario.' });
    }

    if (role === 'USER' && id !== me) {
      return res.status(403).json({ error: 'Acesso negado: so pode ver seu proprio perfil.' });
    }

    const user = await UserService.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        appGrants: {
          select: {
            companyId: true,
            granted: true,
            app: { select: { appKey: true } }
          }
        },
        companies: {
          select: {
            role: true,
            isDefault: true,
            isCompanyOwner: true,
            manageFinancialAccounts: true,
            manageFinancialCategories: true,
            company: { select: { id: true, name: true, code: true } }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario nao encontrado.' });
    }

    return res.status(200).json(user);
  } catch (error) {
    logger.error(`Erro ao buscar usuario ${id}:`, error);
    return res.status(500).json({ error: 'Erro interno ao buscar usuario.' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const actor = getUserContext(req);
  const { role, companyId, userId: me } = actor;
  const id = Number(req.params.id);
  const { email, password, name, newRole, companies, appGrants, platformAdmin } = req.body;
  const requestedCompanies = normalizeCompanyMemberships(companies);
  const mayManageOwnership = canManageCompanyOwnership(actor);
  const grantsPayload = toAppGrantPayload(appGrants);

  if (platformAdmin !== undefined && !req.user.platformAdmin) {
    return res.status(403).json({ error: 'Apenas administradores do Zenit podem definir acesso à plataforma.' });
  }
  if (platformAdmin === false && id === me) {
    return res.status(403).json({ error: 'Você não pode remover seu próprio acesso à plataforma.' });
  }

  if ((role === 'USER' && Array.isArray(appGrants)) ||
      (role !== 'ADMIN' && grantsPayload.some(grant => grant.companyId !== companyId))) {
    return res.status(403).json({ error: 'Sem permissão para alterar estes acessos por aplicativo.' });
  }

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  if (newRole && id === me) {
    return res.status(403).json({ error: 'Voce nao pode alterar seu proprio role.' });
  }

  try {
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (targetUser?.role === 'ADMIN' && !req.user.platformAdmin && id !== me) {
      return res.status(403).json({ error: 'Somente administradores do Zenit podem editar este usuário.' });
    }
    if (Array.isArray(companies) && companies.length === 0 && !(platformAdmin ?? targetUser?.role === 'ADMIN')) {
      return res.status(400).json({ error: 'Vincule o usuário a uma empresa ou conceda acesso à plataforma.' });
    }
    const userExists = await UserService.userBelongsToCompany(id, companyId);

    if (role !== 'ADMIN' && !userExists) {
      return res.status(403).json({ error: 'Acesso negado a este usuario.' });
    }

    if (role === 'SUPERUSER' && !userExists) {
      return res.status(403).json({ error: 'SUPERUSER nao pode editar usuario de outra empresa.' });
    }

    if (role === 'USER') {
      if (id !== me) {
        return res.status(403).json({ error: 'USER so pode editar seu proprio perfil.' });
      }
      if (newRole) {
        return res.status(403).json({ error: 'USER nao pode alterar role.' });
      }
    }

    const updateData: any = {};
    if (email) updateData.email = email;
    if (name) updateData.name = name;
    if (password) {
      updateData.password = password;
      updateData.mustChangePassword = id === me ? false : true;
    }
    if (newRole && (role === 'ADMIN' || (role === 'SUPERUSER' && newRole !== 'ADMIN'))) {
      updateData.role = newRole;
    }

    let ctx: number | CompanyMembershipInput[] | undefined = companyId;
    if (role === 'ADMIN' && Array.isArray(companies)) {
      ctx = requestedCompanies;
    } else if (role === 'SUPERUSER' && actor.isCompanyOwner && requestedCompanies.length > 0) {
      if (requestedCompanies.some((company) => company.companyId !== companyId)) {
        return res.status(403).json({ error: 'SUPERUSER nao pode editar usuario em outra empresa.' });
      }

      if (requestedCompanies.some((company) => company.role === 'ADMIN')) {
        return res.status(403).json({ error: 'SUPERUSER nao pode promover usuario a ADMIN.' });
      }

      ctx = requestedCompanies;
    } else {
      if (!mayManageOwnership && requestedCompanies.some((company) => company.isCompanyOwner)) {
        return res.status(403).json({
          error: 'Apenas ADMIN ou company owner podem conceder company owner.'
        });
      }

      if (requestedCompanies.some((company) => company.companyId !== companyId)) {
        return res.status(403).json({ error: 'SUPERUSER nao pode editar usuario em outra empresa.' });
      }
    }

    const permittedCompanyIds = Array.isArray(ctx)
      ? ctx.map(company => company.companyId)
      : (await prisma.userCompany.findMany({ where: { userId: id }, select: { companyId: true } })).map(company => company.companyId);
    if (grantsPayload.some(grant => !permittedCompanyIds.includes(grant.companyId))) {
      return res.status(403).json({ error: 'Permissões de aplicativos devem pertencer às empresas do usuário.' });
    }
    const updated = await UserService.updateUser(id, updateData, ctx, platformAdmin);

    if (grantsPayload.length > 0) {
      await AppAccessService.setUserGrantsForManyCompanies(id, grantsPayload);
    }

    return res.status(200).json(updated);
  } catch (error) {
    logger.error(`Erro ao atualizar usuario ${id}:`, error);

    const status = getBusinessErrorStatus(error);
    if (status && error instanceof Error) {
      return res.status(status).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Erro interno ao atualizar usuario.' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const { role, companyId } = getUserContext(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de usuario invalido.' });
  }

  if (role === 'USER') {
    return res.status(403).json({ error: 'USER nao pode excluir usuarios.' });
  }

  try {
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (targetUser?.role === 'ADMIN' && (!req.user.platformAdmin || req.user.userId === id)) {
      return res.status(403).json({ error: 'Não é permitido excluir este administrador da plataforma.' });
    }
    const userExists = await UserService.userBelongsToCompany(id, companyId);

    if (role !== 'ADMIN' && !userExists) {
      return res.status(403).json({ error: 'Acesso negado a este usuario.' });
    }

    await UserService.deleteUser(id);
    return res.status(204).send();
  } catch (error) {
    logger.error(`Erro ao excluir usuario ${id}:`, error);

    const status = getBusinessErrorStatus(error);
    if (status && error instanceof Error) {
      return res.status(status).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Erro interno ao excluir usuario.' });
  }
};
