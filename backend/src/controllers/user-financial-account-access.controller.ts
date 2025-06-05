// backend/src/controllers/user-financial-account-access.controller.ts
import { Request, Response } from 'express';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { userId: number; role: string; companyId: number } {
  // @ts-ignore - O middleware já validou a existência desses valores
  const { userId, role, companyId } = req.user;
  
  if (!companyId) {
    throw new Error('Contexto de empresa não encontrado');
  }
  
  return { userId, role, companyId };
}

/**
 * GET /api/users/:userId/account-access
 * Obtém resumo dos acessos de um usuário específico
 */
export async function getUserAccountAccess(req: Request, res: Response) {
  try {
    const targetUserId = Number(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    const { companyId } = getUserContext(req);
    
    const accessSummary = await UserFinancialAccountAccessService.getUserAccessSummary(
      targetUserId, 
      companyId
    );

    return res.status(200).json(accessSummary);
  } catch (error: any) {
    logger.error('Error getting user account access', { error: error.message });
    return res.status(500).json({
      error: 'Erro ao obter acessos do usuário'
    });
  }
}

/**
 * POST /api/users/:userId/account-access/grant
 * Concede acesso a contas específicas para um usuário
 */
export async function grantAccountAccess(req: Request, res: Response) {
  try {
    const targetUserId = Number(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    const { accountIds } = req.body;
    
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ 
        error: 'Lista de IDs de contas é obrigatória' 
      });
    }

    const { userId: grantedBy, companyId } = getUserContext(req);

    await UserFinancialAccountAccessService.grantAccess({
      userId: targetUserId,
      accountIds,
      companyId,
      grantedBy
    });

    logger.info('Account access granted', {
      targetUserId,
      accountIds,
      grantedBy,
      companyId
    });

    return res.status(200).json({ 
      message: 'Acesso concedido com sucesso',
      granted: accountIds.length
    });
  } catch (error: any) {
    logger.error('Error granting account access', { error: error.message });
    return res.status(400).json({
      error: error.message || 'Erro ao conceder acesso'
    });
  }
}

/**
 * POST /api/users/:userId/account-access/grant-all
 * Concede acesso a TODAS as contas da empresa para um usuário
 */
export async function grantAllAccountAccess(req: Request, res: Response) {
  try {
    const targetUserId = Number(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    const { userId: grantedBy, companyId } = getUserContext(req);

    await UserFinancialAccountAccessService.grantAllAccess({
      userId: targetUserId,
      companyId,
      grantedBy
    });

    logger.info('Full account access granted', {
      targetUserId,
      grantedBy,
      companyId
    });

    return res.status(200).json({ 
      message: 'Acesso total concedido com sucesso'
    });
  } catch (error: any) {
    logger.error('Error granting full account access', { error: error.message });
    return res.status(400).json({
      error: error.message || 'Erro ao conceder acesso total'
    });
  }
}

/**
 * DELETE /api/users/:userId/account-access/revoke
 * Revoga acesso a contas específicas para um usuário
 */
export async function revokeAccountAccess(req: Request, res: Response) {
  try {
    const targetUserId = Number(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    const { accountIds } = req.body;
    
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ 
        error: 'Lista de IDs de contas é obrigatória' 
      });
    }

    const { companyId } = getUserContext(req);

    await UserFinancialAccountAccessService.revokeAccess({
      userId: targetUserId,
      accountIds,
      companyId
    });

    logger.info('Account access revoked', {
      targetUserId,
      accountIds,
      companyId
    });

    return res.status(200).json({ 
      message: 'Acesso revogado com sucesso',
      revoked: accountIds.length
    });
  } catch (error: any) {
    logger.error('Error revoking account access', { error: error.message });
    return res.status(400).json({
      error: error.message || 'Erro ao revogar acesso'
    });
  }
}

/**
 * DELETE /api/users/:userId/account-access/revoke-all
 * Revoga TODOS os acessos de um usuário na empresa
 */
export async function revokeAllAccountAccess(req: Request, res: Response) {
  try {
    const targetUserId = Number(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    const { companyId } = getUserContext(req);

    await UserFinancialAccountAccessService.revokeAllAccess(targetUserId, companyId);

    logger.info('All account access revoked', {
      targetUserId,
      companyId
    });

    return res.status(200).json({ 
      message: 'Todos os acessos revogados com sucesso'
    });
  } catch (error: any) {
    logger.error('Error revoking all account access', { error: error.message });
    return res.status(400).json({
      error: error.message || 'Erro ao revogar todos os acessos'
    });
  }
}

/**
 * POST /api/users/:userId/account-access/bulk-update
 * Atualiza em lote os acessos de um usuário (substitui todos os existentes)
 */
export async function bulkUpdateAccountAccess(req: Request, res: Response) {
  try {
    const targetUserId = Number(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    const { accountIds } = req.body;
    
    // accountIds pode ser array vazio (para remover todos os acessos)
    if (!Array.isArray(accountIds)) {
      return res.status(400).json({ 
        error: 'Lista de IDs de contas é obrigatória (pode ser vazia)' 
      });
    }

    const { userId: grantedBy, companyId } = getUserContext(req);

    // Primeiro, remove todos os acessos existentes
    await UserFinancialAccountAccessService.revokeAllAccess(targetUserId, companyId);

    // Depois, concede os novos acessos (se houver)
    if (accountIds.length > 0) {
      await UserFinancialAccountAccessService.grantAccess({
        userId: targetUserId,
        accountIds,
        companyId,
        grantedBy
      });
    }

    logger.info('Bulk account access update', {
      targetUserId,
      newAccessCount: accountIds.length,
      grantedBy,
      companyId
    });

    return res.status(200).json({ 
      message: 'Acessos atualizados com sucesso',
      totalAccess: accountIds.length
    });
  } catch (error: any) {
    logger.error('Error in bulk account access update', { error: error.message });
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar acessos em lote'
    });
  }
}