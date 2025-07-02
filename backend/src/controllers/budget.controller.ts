import { Request, Response } from 'express';
import BudgetService from '../services/budget.service';
import { BudgetStatus, BudgetType, TransactionType } from '@prisma/client';

function getContext(req: Request) {
  const { companyId, userId } = req.user as any;
  return { companyId: Number(companyId), userId: Number(userId) };
}

export async function createOrUpdateBudget(req: Request, res: Response) {
  try {
    const { companyId, userId } = getContext(req);
    const budget = await BudgetService.createOrUpdateBudget({
      ...req.body,
      companyId,
      createdBy: userId
    });
    res.status(201).json(budget);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function listBudgets(req: Request, res: Response) {
  try {
    const { companyId } = getContext(req);
    const budgets = await BudgetService.listBudgets(companyId);
    res.json(budgets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function addTransaction(req: Request, res: Response) {
  try {
    const { companyId, userId } = getContext(req);
    const { id } = req.params;
    const tx = await BudgetService.addTransaction(Number(id), {
      ...req.body,
      companyId,
      createdBy: userId,
      type: req.body.type as TransactionType
    });
    res.status(201).json(tx);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

