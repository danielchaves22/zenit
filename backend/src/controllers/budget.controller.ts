import { Request, Response } from 'express';
import BudgetService from '../services/budget.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number } {
  const { companyId, userId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return { companyId, userId };
}

export async function getBudgets(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const budgets = await BudgetService.listBudgets(companyId, userId);
    return res.status(200).json(budgets);
  } catch (error) {
    logger.error('Erro ao listar budgets', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.userId,
      companyId: req.user?.companyId
    });

    return res.status(500).json({ error: 'Erro ao listar budgets' });
  }
}

export async function syncBudgets(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const { deviceId, budgets } = req.body;
    const result = await BudgetService.syncBudgets(companyId, userId, deviceId, budgets);
    return res.status(200).json(result);
  } catch (error) {
    logger.error('Erro ao sincronizar budgets', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.userId,
      companyId: req.user?.companyId
    });

    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao sincronizar budgets'
    });
  }
}
