import { Request, Response } from 'express';
import FinancialAccountService from '../services/financial-account.service';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import { ListAccountsQuery } from '../validators/financial-account.validator';
import { logger } from '../utils/logger';

function isAccountValidationError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return ['Ja existe', 'Nao e possivel', 'Cartoes de credito'].some((fragment) =>
    message.includes(fragment)
  );
}

function isAccountDeleteConflict(message?: string): boolean {
  if (!message) {
    return false;
  }

  return message.includes('transacoes associadas');
}

function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore auth middleware already injects these values
  const { companyId, userId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return { companyId, userId };
}

export async function createAccount(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      name,
      type,
      initialBalance,
      accountNumber,
      bankName,
      bankCode,
      bankId,
      allowNegativeBalance,
      creditLimit,
      cardColor,
      statementClosingDay,
      statementDueDay
    } = req.body;

    const account = await FinancialAccountService.createAccount({
      name,
      type,
      initialBalance,
      accountNumber,
      bankName,
      bankCode,
      bankId,
      allowNegativeBalance,
      creditLimit,
      cardColor,
      statementClosingDay,
      statementDueDay,
      companyId
    });

    return res.status(201).json(account);
  } catch (error: any) {
    logger.error('Erro ao criar conta financeira:', error);
    return res.status(isAccountValidationError(error.message) ? 400 : 500).json({
      error: error.message || 'Erro ao criar conta financeira'
    });
  }
}

export async function getAccounts(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    // @ts-ignore auth middleware injects these values
    const { userId, role } = req.user;
    const {
      type,
      isActive,
      search,
      allowNegativeBalance
    } = req.query as unknown as ListAccountsQuery;

    const accessibleAccountIds =
      await UserFinancialAccountAccessService.getUserAccessibleAccounts(
        userId,
        role,
        companyId
      );

    const accounts = await FinancialAccountService.listAccounts({
      companyId,
      type: type as any,
      isActive,
      allowNegativeBalance,
      search,
      accountIds: accessibleAccountIds
    });

    return res.status(200).json(accounts);
  } catch (error) {
    logger.error('Erro ao listar contas financeiras:', error);
    return res.status(500).json({
      error: 'Erro ao listar contas financeiras'
    });
  }
}

export async function getAccountById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const account = await FinancialAccountService.getAccountById(id);
    if (!account) {
      return res.status(404).json({ error: 'Conta financeira nao encontrada' });
    }

    const { companyId } = getUserContext(req);
    if (account.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.status(200).json(account);
  } catch (error) {
    logger.error('Erro ao buscar conta financeira:', error);
    return res.status(500).json({
      error: 'Erro ao buscar conta financeira'
    });
  }
}

export async function updateAccount(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const existingAccount = await FinancialAccountService.getAccountById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: 'Conta financeira nao encontrada' });
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
      bankCode,
      bankId,
      isActive,
      allowNegativeBalance,
      creditLimit,
      cardColor,
      statementClosingDay,
      statementDueDay
    } = req.body;

    const updatedAccount = await FinancialAccountService.updateAccount(id, {
      name,
      type,
      accountNumber,
      bankName,
      bankCode,
      bankId,
      isActive,
      allowNegativeBalance,
      creditLimit,
      cardColor,
      statementClosingDay,
      statementDueDay
    });

    return res.status(200).json(updatedAccount);
  } catch (error: any) {
    logger.error('Erro ao atualizar conta financeira:', error);
    return res.status(isAccountValidationError(error.message) ? 400 : 500).json({
      error: error.message || 'Erro ao atualizar conta financeira'
    });
  }
}

export async function deleteAccount(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const existingAccount = await FinancialAccountService.getAccountById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: 'Conta financeira nao encontrada' });
    }

    const { companyId } = getUserContext(req);
    if (existingAccount.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await FinancialAccountService.deleteAccount(id);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Erro ao excluir conta financeira:', error);
    return res.status(isAccountDeleteConflict(error.message) ? 400 : 500).json({
      error: error.message || 'Erro ao excluir conta financeira'
    });
  }
}

export async function adjustBalance(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const existingAccount = await FinancialAccountService.getAccountById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: 'Conta financeira nao encontrada' });
    }

    const { companyId, userId } = getUserContext(req);
    if (existingAccount.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { newBalance, reason } = req.body;
    if (newBalance === undefined || !reason) {
      return res.status(400).json({
        error: 'Novo saldo e motivo do ajuste sao obrigatorios'
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
    logger.error('Erro ao ajustar saldo:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao ajustar saldo da conta'
    });
  }
}
