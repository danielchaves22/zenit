import { Request, Response } from 'express';
import FinancialAccountService from '../services/financial-account.service';
import { logger } from '../utils/logger';

/**
 * Função helper simplificada: extrai o único companyId e userId do token
 */
function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - O middleware já validou a existência desses valores
  const { companyId, userId } = req.user;
  
  if (!companyId) {
    throw new Error('Contexto de empresa não encontrado');
  }
  
  return { companyId, userId };
}

/**
 * POST /api/financial/accounts
 * Cria uma nova conta financeira
 */
export async function createAccount(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      name,
      type,
      initialBalance,
      accountNumber,
      bankName,
      allowNegativeBalance
    } = req.body;

    const account = await FinancialAccountService.createAccount({
      name,
      type,
      initialBalance,
      accountNumber,
      bankName,
      allowNegativeBalance,
      companyId
    });

    return res.status(201).json(account);
  } catch (error: any) {
    logger.error('Erro ao criar conta financeira:', error);
    return res.status(error.message.includes('já existe') ? 400 : 500).json({
      error: error.message || 'Erro ao criar conta financeira'
    });
  }
}

/**
 * GET /api/financial/accounts
 * Lista contas financeiras com filtros opcionais
 */
export async function getAccounts(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { type, isActive, search, allowNegativeBalance } = req.query;

    const accounts = await FinancialAccountService.listAccounts({
      companyId,
      type: type as any,
      isActive: typeof isActive === 'string' ? isActive === 'true' : undefined,
      allowNegativeBalance:
        typeof allowNegativeBalance === 'string'
          ? allowNegativeBalance === 'true'
          : undefined,
      search: search as string
    });

    return res.status(200).json(accounts);
  } catch (error) {
    logger.error('Erro ao listar contas financeiras:', error);
    return res.status(500).json({
      error: 'Erro ao listar contas financeiras'
    });
  }
}

/**
 * GET /api/financial/accounts/:id
 * Obtém uma conta financeira pelo ID
 */
export async function getAccountById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const account = await FinancialAccountService.getAccountById(id);
    if (!account) {
      return res.status(404).json({ error: 'Conta financeira não encontrada' });
    }

    // Verifica se a conta pertence à empresa do usuário
    const { companyId } = getUserContext(req);
    if (account.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.status(200).json(account);
  } catch (error) {
    logger.error(`Erro ao buscar conta financeira:`, error);
    return res.status(500).json({
      error: 'Erro ao buscar conta financeira'
    });
  }
}

/**
 * PUT /api/financial/accounts/:id
 * Atualiza uma conta financeira
 */
export async function updateAccount(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Verificar se a conta existe e pertence à empresa do usuário
    const existingAccount = await FinancialAccountService.getAccountById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: 'Conta financeira não encontrada' });
    }

    const { companyId } = getUserContext(req);
    if (existingAccount.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const {
      name,
      type,
      accountNumber,
      bankName,
      isActive,
      allowNegativeBalance
    } = req.body;
    const updatedAccount = await FinancialAccountService.updateAccount(id, {
      name,
      type,
      accountNumber,
      bankName,
      isActive,
      allowNegativeBalance
    });

    return res.status(200).json(updatedAccount);
  } catch (error: any) {
    logger.error(`Erro ao atualizar conta financeira:`, error);
    return res.status(error.message.includes('já existe') ? 400 : 500).json({
      error: error.message || 'Erro ao atualizar conta financeira'
    });
  }
}

/**
 * DELETE /api/financial/accounts/:id
 * Exclui uma conta financeira (se não tiver transações)
 */
export async function deleteAccount(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Verificar se a conta existe e pertence à empresa do usuário
    const existingAccount = await FinancialAccountService.getAccountById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: 'Conta financeira não encontrada' });
    }

    const { companyId } = getUserContext(req);
    if (existingAccount.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await FinancialAccountService.deleteAccount(id);
    return res.status(204).send();
  } catch (error: any) {
    logger.error(`Erro ao excluir conta financeira:`, error);
    return res.status(error.message.includes('transações') ? 400 : 500).json({
      error: error.message || 'Erro ao excluir conta financeira'
    });
  }
}

/**
 * POST /api/financial/accounts/:id/adjust-balance
 * Ajusta o saldo de uma conta (operação administrativa)
 */
export async function adjustBalance(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Verificar se a conta existe e pertence à empresa do usuário
    const existingAccount = await FinancialAccountService.getAccountById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: 'Conta financeira não encontrada' });
    }

    const { companyId, userId } = getUserContext(req);
    if (existingAccount.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { newBalance, reason } = req.body;
    if (newBalance === undefined || !reason) {
      return res.status(400).json({ 
        error: 'Novo saldo e motivo do ajuste são obrigatórios' 
      });
    }

    const updatedAccount = await FinancialAccountService.adjustBalance(
      id,
      newBalance,
      userId,
      reason
    );

    return res.status(200).json(updatedAccount);
  } catch (error: any) {
    logger.error(`Erro ao ajustar saldo:`, error);
    return res.status(500).json({
      error: error.message || 'Erro ao ajustar saldo da conta'
    });
  }
}