// backend/src/controllers/financial-recurring.controller.ts
import { Request, Response } from 'express';
import RecurringTransactionService from '../services/recurring-transaction.service';
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
 * POST /api/financial/recurring
 * Cria uma nova transação recorrente
 */
export async function createRecurringTransaction(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    
    const {
      description,
      amount,
      type,
      frequency,
      dayOfMonth,
      dayOfWeek,
      startDate,
      endDate,
      notes,
      fromAccountId,
      toAccountId,
      categoryId
    } = req.body;

    const recurring = await RecurringTransactionService.createRecurringTransaction({
      description,
      amount,
      type,
      frequency,
      dayOfMonth,
      dayOfWeek,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      companyId,
      createdBy: userId
    });

    return res.status(201).json(recurring);
  } catch (error: any) {
    logger.error('Erro ao criar transação recorrente:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao criar transação recorrente'
    });
  }
}

/**
 * GET /api/financial/recurring
 * Lista transações recorrentes com filtros opcionais
 */
export async function getRecurringTransactions(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { type, isActive } = req.query;

    const recurring = await RecurringTransactionService.listRecurringTransactions({
      companyId,
      type: type as any,
      isActive: typeof isActive === 'string' ? isActive === 'true' : undefined
    });

    return res.status(200).json(recurring);
  } catch (error) {
    logger.error('Erro ao listar transações recorrentes:', error);
    return res.status(500).json({
      error: 'Erro ao listar transações recorrentes'
    });
  }
}

/**
 * GET /api/financial/recurring/:id
 * Obtém uma transação recorrente pelo ID
 */
export async function getRecurringTransactionById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const recurring = await RecurringTransactionService.getRecurringTransactionById(id);
    if (!recurring) {
      return res.status(404).json({ error: 'Transação recorrente não encontrada' });
    }

    // Verificar se pertence à empresa do usuário
    const { companyId } = getUserContext(req);
    if (recurring.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.status(200).json(recurring);
  } catch (error) {
    logger.error(`Erro ao buscar transação recorrente:`, error);
    return res.status(500).json({
      error: 'Erro ao buscar transação recorrente'
    });
  }
}

/**
 * PUT /api/financial/recurring/:id
 * Atualiza uma transação recorrente
 */
export async function updateRecurringTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se existe e pertence à empresa
    const existing = await RecurringTransactionService.getRecurringTransactionById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Transação recorrente não encontrada' });
    }

    if (existing.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updateData = req.body;
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const updated = await RecurringTransactionService.updateRecurringTransaction(
      id,
      updateData,
      companyId
    );

    return res.status(200).json(updated);
  } catch (error: any) {
    logger.error(`Erro ao atualizar transação recorrente:`, error);
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar transação recorrente'
    });
  }
}

/**
 * DELETE /api/financial/recurring/:id
 * Exclui uma transação recorrente
 */
export async function deleteRecurringTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se existe e pertence à empresa
    const existing = await RecurringTransactionService.getRecurringTransactionById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Transação recorrente não encontrada' });
    }

    if (existing.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await RecurringTransactionService.deleteRecurringTransaction(id, companyId);
    return res.status(204).send();
  } catch (error: any) {
    logger.error(`Erro ao excluir transação recorrente:`, error);
    return res.status(500).json({
      error: error.message || 'Erro ao excluir transação recorrente'
    });
  }
}

/**
 * POST /api/financial/recurring/:id/generate
 * Gera transações futuras baseadas no template recorrente
 */
export async function generateScheduledTransactions(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);
    const { monthsAhead = 12 } = req.body;

    const generated = await RecurringTransactionService.generateScheduledTransactions(
      id,
      monthsAhead,
      companyId
    );

    return res.status(200).json({ 
      generated,
      message: `${generated} transações agendadas foram criadas` 
    });
  } catch (error: any) {
    logger.error(`Erro ao gerar transações agendadas:`, error);
    return res.status(400).json({
      error: error.message || 'Erro ao gerar transações agendadas'
    });
  }
}

/**
 * GET /api/financial/recurring/projections
 * Obtém projeções de transações recorrentes para um período
 */
export async function getProjectedTransactions(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { type, startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate e endDate são obrigatórios' 
      });
    }

    const projections = await RecurringTransactionService.getProjectedTransactions({
      companyId,
      type: type as any,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    });

    return res.status(200).json(projections);
  } catch (error) {
    logger.error('Erro ao obter projeções:', error);
    return res.status(500).json({
      error: 'Erro ao obter projeções de transações'
    });
  }
}