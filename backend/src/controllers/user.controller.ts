import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import UserService from '../services/user.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const EQUINOX_COMPANY_CODE = 0;

/**
 * Extrai do token os dados de contexto do usuário autenticado.
 * Versão simplificada: um usuário pertence a apenas uma empresa.
 */
function getUserContext(req: Request): { userId: number; role: Role; companyId: number } {
  // @ts-ignore
  const { userId, role, companyId } = req.user;
  return {
    userId: userId as number,
    role: role as Role,
    companyId: companyId as number
  };
}

/**
 * POST /api/users
 * Simplificado: garante que cada usuário pertence a apenas uma empresa.
 */
export const createUser = async (req: Request, res: Response) => {
  const { role, companyId } = getUserContext(req);
  const { email, password, name, newRole, companyId: targetCompanyId, companies } = req.body;

  // Validações de campos obrigatórios
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password e name são obrigatórios.' });
  }
  
  // Validações de permissão
  if (role === 'USER') {
    return res.status(403).json({ error: 'Acesso negado: USER não pode criar usuários.' });
  }

  if (role === 'ADMIN' && newRole !== 'ADMIN' && newRole !== 'SUPERUSER') {
    return res.status(403).json({
      error: 'ADMIN só pode criar usuários ADMIN ou SUPERUSER.'
    });
  }

  if (role === 'SUPERUSER' && newRole === 'ADMIN') {
    return res.status(403).json({
      error: 'SUPERUSER não pode criar usuários ADMIN.'
    });
  }

  let companiesToCreate: { companyId: number; role: Role; manageFinancialAccounts?: boolean; manageFinancialCategories?: boolean }[] = [];

  // Definição do role a ser atribuído
  let roleToAssign: Role;
  if (role === 'ADMIN') {
    roleToAssign = newRole as Role; // validado anteriormente
  } else {
    roleToAssign = newRole === 'SUPERUSER' ? 'SUPERUSER' : 'USER';
  }

  if (role === 'SUPERUSER') {
    let targetId = targetCompanyId !== undefined ? Number(targetCompanyId) : undefined;
    let accountOpts: { manageFinancialAccounts?: boolean; manageFinancialCategories?: boolean } = {};
    if (targetId === undefined) {
      if (Array.isArray(companies) && companies.length === 1) {
        targetId = Number(companies[0].companyId);
        accountOpts.manageFinancialAccounts = companies[0].manageFinancialAccounts;
        accountOpts.manageFinancialCategories = companies[0].manageFinancialCategories;
      } else {
        return res.status(400).json({ error: 'É necessário informar companyId ou companies com uma empresa.' });
      }
    }
    if (companyId !== targetId) {
      return res.status(403).json({ error: 'SUPERUSER não pode criar usuário em outra empresa.' });
    }
    companiesToCreate.push({
      companyId: targetId,
      role: roleToAssign,
      ...accountOpts
    });
  } else if (role === 'ADMIN') {
    if (Array.isArray(companies) && companies.length > 0) {
      companiesToCreate = companies.map((c: any) => ({
        companyId: Number(c.companyId),
        role: c.role as Role,
        manageFinancialAccounts: c.manageFinancialAccounts,
        manageFinancialCategories: c.manageFinancialCategories
      }));
      const adminCompanies = companiesToCreate.filter(c => c.role === 'ADMIN');
      if (adminCompanies.length > 0) {
        const equinox = await prisma.company.findUnique({ where: { code: EQUINOX_COMPANY_CODE } });
        if (!equinox || adminCompanies.some(c => c.companyId !== equinox.id)) {
          return res.status(403).json({ error: 'ADMIN só pode criar ADMIN vinculado à Equinox.' });
        }
      }
    } else if (targetCompanyId !== undefined) {
      if (roleToAssign === 'ADMIN') {
        const equinox = await prisma.company.findUnique({ where: { code: EQUINOX_COMPANY_CODE } });
        if (!equinox || Number(targetCompanyId) !== equinox.id) {
          return res.status(403).json({ error: 'ADMIN só pode criar ADMIN vinculado à Equinox.' });
        }
      }
      companiesToCreate.push({ companyId: Number(targetCompanyId), role: roleToAssign });
    } else {
      return res.status(400).json({ error: 'É necessário informar companies ou companyId.' });
    }
  }

  try {
    const created = await UserService.createUser({
      email,
      password,
      name,
      companies: companiesToCreate
    });
    return res.status(201).json(created);
  } catch (error: any) {
    logger.error('Erro ao criar usuário:', error);
    
    // Erro específico: usuário já tem uma empresa
    if (error.message.includes('já está associado')) {
      return res.status(400).json({ error: error.message });
    }
    
    return res.status(500).json({ error: 'Erro interno ao criar usuário.' });
  }
};

/**
 * GET /api/users
 * Lista usuários de acordo com permissões
 */
export const getUsers = async (req: Request, res: Response) => {
  const { role, companyId, userId: me } = getUserContext(req);

  let filterCompanyId: number | undefined = undefined;

  if (role === 'ADMIN' && req.query.companyId !== undefined) {
    const parsed = Number(req.query.companyId);
    if (isNaN(parsed)) {
      return res.status(400).json({ error: 'companyId inválido.' });
    }
    filterCompanyId = parsed;
  }

  try {
    let users;
    
    // Base de seleção para todos os casos
    const baseSelect = {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        companies: {
          select: {
            role: true,
            isDefault: true,
            manageFinancialAccounts: true,
            manageFinancialCategories: true,
            company: { select: { id: true, name: true, code: true } }
          }
        }
      }
    };

    // ADMIN pode ver todos os usuários (com filtro opcional por empresa)
    if (role === 'ADMIN') {
      users = await UserService.listUsers(baseSelect, filterCompanyId);
    }
    // SUPERUSER vê usuários da mesma empresa
    else if (role === 'SUPERUSER') {
      users = await UserService.listUsers(baseSelect, companyId);
    }
    // USER vê apenas seu próprio perfil
    else {
      users = await UserService.listUsers({
        ...baseSelect,
        where: { id: me }
      }, companyId);
    }

    return res.status(200).json(users);
  } catch (error) {
    logger.error('Erro ao listar usuários:', error);
    return res.status(500).json({ error: 'Erro interno ao listar usuários.' });
  }
};

/**
 * GET /api/users/:id
 * Obtém um usuário específico de acordo com permissões
 */
export const getUserById = async (req: Request, res: Response) => {
  const { role, companyId, userId: me } = getUserContext(req);
  const id = Number(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de usuário inválido.' });
  }

  try {
    // Verifica se o usuário existe e tem acesso à empresa
    const userExists = await UserService.userBelongsToCompany(id, companyId);
    
    // Se não for admin, não pode ver usuários de outras empresas
    if (role !== 'ADMIN' && !userExists) {
      return res.status(403).json({ error: 'Acesso negado a este usuário.' });
    }
    
    // Se for USER, só pode ver seu próprio perfil
    if (role === 'USER' && id !== me) {
      return res.status(403).json({ error: 'Acesso negado: só pode ver seu próprio perfil.' });
    }

    const user = await UserService.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companies: {
          select: {
            role: true,
            isDefault: true,
            manageFinancialAccounts: true,
            manageFinancialCategories: true,
            company: { select: { id: true, name: true, code: true } }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.status(200).json(user);
  } catch (error) {
    logger.error(`Erro ao buscar usuário ${id}:`, error);
    return res.status(500).json({ error: 'Erro interno ao buscar usuário.' });
  }
};

/**
 * PUT /api/users/:id
 * Atualiza um usuário
 */
export const updateUser = async (req: Request, res: Response) => {
  const { role, companyId, userId: me } = getUserContext(req);
  const id = Number(req.params.id);
  const { email, password, name, newRole, companies } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido.' });
  }
  
  if (newRole && id === me) {
    return res.status(403).json({ error: 'Você não pode alterar seu próprio role.' });
  }

  try {
    // Verifica se o usuário existe e tem acesso à empresa
    const userExists = await UserService.userBelongsToCompany(id, companyId);
    
    // Se não for admin, não pode editar usuários de outras empresas
    if (role !== 'ADMIN' && !userExists) {
      return res.status(403).json({ error: 'Acesso negado a este usuário.' });
    }
    
    // Se for SUPERUSER, pode editar usuários da mesma empresa
    if (role === 'SUPERUSER' && !userExists) {
      return res.status(403).json({ error: 'SUPERUSER não pode editar usuário de outra empresa.' });
    }
    
    // Se for USER, só pode editar seu próprio perfil
    if (role === 'USER') {
      if (id !== me) {
        return res.status(403).json({ error: 'USER só pode editar seu próprio perfil.' });
      }
      if (newRole) {
        return res.status(403).json({ error: 'USER não pode alterar role.' });
      }
    }

    // Preparar objeto de atualização
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

    // Realizar a atualização
    let ctx: number | { companyId: number; role: Role }[] | undefined = companyId;
    const equinox = await prisma.company.findUnique({ where: { code: EQUINOX_COMPANY_CODE } });
    if (role === 'ADMIN' && Array.isArray(companies)) {
      if (!equinox) {
        return res.status(500).json({ error: 'Empresa Equinox não encontrada' });
      }
      const invalidAdmin = companies.some((c: any) => c.role === 'ADMIN' && Number(c.companyId) !== equinox.id);
      if (invalidAdmin) {
        return res.status(403).json({ error: 'ADMIN só pode vincular ADMIN à Equinox.' });
      }
      ctx = companies.map((c: any) => ({
        companyId: Number(c.companyId),
        role: c.role as Role,
        manageFinancialAccounts: c.manageFinancialAccounts,
        manageFinancialCategories: c.manageFinancialCategories
      }));
    }
    if (newRole === 'ADMIN' && role === 'ADMIN') {
      if (!equinox) {
        return res.status(500).json({ error: 'Empresa Equinox não encontrada' });
      }
      if (Array.isArray(companies)) {
        const hasEquinoxAdmin = companies.some((c: any) => c.role === 'ADMIN' && Number(c.companyId) === equinox.id);
        if (!hasEquinoxAdmin) {
          return res.status(403).json({ error: 'Usuário ADMIN deve estar vinculado à Equinox.' });
        }
      } else if (ctx && typeof ctx === 'number' && ctx !== equinox.id) {
        return res.status(403).json({ error: 'Usuário ADMIN deve estar vinculado à Equinox.' });
      }
    }
    const updated = await UserService.updateUser(id, updateData, ctx);
    return res.status(200).json(updated);
  } catch (error) {
    logger.error(`Erro ao atualizar usuário ${id}:`, error);
    return res.status(500).json({ error: 'Erro interno ao atualizar usuário.' });
  }
};

/**
 * DELETE /api/users/:id
 * Exclui um usuário
 */
export const deleteUser = async (req: Request, res: Response) => {
  const { role, companyId } = getUserContext(req);
  const id = Number(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de usuário inválido.' });
  }
  
  if (role === 'USER') {
    return res.status(403).json({ error: 'USER não pode excluir usuários.' });
  }

  try {
    // Verifica se o usuário existe e tem acesso à empresa
    const userExists = await UserService.userBelongsToCompany(id, companyId);
    
    // Se não for admin, não pode excluir usuários de outras empresas
    if (role !== 'ADMIN' && !userExists) {
      return res.status(403).json({ error: 'Acesso negado a este usuário.' });
    }
    
    // Realizar a exclusão
    await UserService.deleteUser(id);
    return res.status(204).send();
  } catch (error) {
    logger.error(`Erro ao excluir usuário ${id}:`, error);
    return res.status(500).json({ error: 'Erro interno ao excluir usuário.' });
  }
};