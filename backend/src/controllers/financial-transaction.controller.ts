import { Request, Response } from 'express';
import FinancialTransactionService from '../services/financial-transaction.service';
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
 * POST /api/financial/transactions
 * Cria uma nova transação financeira
 */
export async function createTransaction(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    
    const {
      description,
      amount,
      date,
      type,
      status,
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      tags
    } = req.body;

    const transaction = await FinancialTransactionService.createTransaction({
      description,
      amount,
      date: new Date(date),
      type,
      status,
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      companyId,
      createdBy: userId,
      tags
    });

    return res.status(201).json(transaction);
  } catch (error: any) {
    logger.error('Erro ao criar transação financeira:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao criar transação financeira'
    });
  }
}

/**
 * GET /api/financial/transactions
 * Lista transações financeiras com filtros avançados
 */
export async function getTransactions(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    
    const {
      startDate,
      endDate,
      type,
      status,
      accountId,
      categoryId,
      search,
      page,
      pageSize
    } = req.query;

    const result = await FinancialTransactionService.listTransactions({
      companyId,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      type: type as any,
      status: status as any,
      accountId: accountId ? Number(accountId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      search: search as string,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Erro ao listar transações financeiras:', error);
    return res.status(500).json({
      error: 'Erro ao listar transações financeiras'
    });
  }
}

/**
 * GET /api/financial/transactions/:id
 * Obtém uma transação financeira específica pelo ID
 */
export async function getTransactionById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const transaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    // Verificar se pertence à empresa do usuário
    const { companyId } = getUserContext(req);
    if (transaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.status(200).json(transaction);
  } catch (error) {
    logger.error(`Erro ao buscar transação financeira:`, error);
    return res.status(500).json({
      error: 'Erro ao buscar transação financeira'
    });
  }
}

/**
 * PUT /api/financial/transactions/:id
 * Atualiza uma transação financeira
 */
export async function updateTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se a transação existe e pertence à empresa
    const existingTransaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!existingTransaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (existingTransaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updateData = req.body;
    const updatedTransaction = await FinancialTransactionService.updateTransaction(
      id,
      updateData,
      companyId
    );

    return res.status(200).json(updatedTransaction);
  } catch (error: any) {
    logger.error(`Erro ao atualizar transação financeira:`, error);
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar transação financeira'
    });
  }
}

/**
 * PATCH /api/financial/transactions/:id/status
 * Atualiza apenas o status de uma transação
 */
export async function updateTransactionStatus(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se a transação existe e pertence à empresa
    const existingTransaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!existingTransaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (existingTransaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { status } = req.body;
    const updatedTransaction = await FinancialTransactionService.updateTransactionStatus(
      id,
      status
    );

    return res.status(200).json(updatedTransaction);
  } catch (error: any) {
    logger.error(`Erro ao atualizar status da transação:`, error);
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar status da transação'
    });
  }
}

/**
 * DELETE /api/financial/transactions/:id
 * Exclui uma transação financeira
 */
export async function deleteTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se a transação existe e pertence à empresa
    const existingTransaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!existingTransaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (existingTransaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await FinancialTransactionService.deleteTransaction(id);
    return res.status(204).send();
  } catch (error: any) {
    logger.error(`Erro ao excluir transação financeira:`, error);
    return res.status(500).json({
      error: error.message || 'Erro ao excluir transação financeira'
    });
  }
}

/**
 * GET /api/financial/summary
 * Obtém um resumo financeiro para o dashboard
 */
export async function getFinancialSummary(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    
    // Parâmetros de período (padrão: mês atual)
    const { 
      startDate: startDateParam, 
      endDate: endDateParam 
    } = req.query;

    let startDate: Date;
    let endDate: Date;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam as string);
      endDate = new Date(endDateParam as string);
    } else {
      // Padrão: mês atual
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Primeiro dia do mês
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Último dia do mês
    }

    const summary = await FinancialTransactionService.getFinancialSummary(
      companyId,
      startDate,
      endDate
    );

    return res.status(200).json({
      ...summary,
      period: {
        startDate,
        endDate
      }
    });
  } catch (error) {
    logger.error('Erro ao obter resumo financeiro:', error);
    return res.status(500).json({
      error: 'Erro ao obter resumo financeiro'
    });
  }
}