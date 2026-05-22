import { Request, Response } from 'express';
import FinancialTransactionService from '../services/financial-transaction.service';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import { logger } from '../utils/logger';

/**
 * FunÃ§Ã£o helper simplificada: extrai o Ãºnico companyId e userId do token
 */
function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - O middleware jÃ¡ validou a existÃªncia desses valores
  const { companyId, userId } = req.user;
  
  if (!companyId) {
    throw new Error('Contexto de empresa nÃ£o encontrado');
  }
  
  return { companyId, userId };
}

/**
 * POST /api/financial/transactions
 * Cria uma nova transaÃ§Ã£o financeira
 */
export async function createTransaction(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    
    const {
      description,
      amount,
      date,
      dueDate,
      effectiveDate,
      type,
      status,
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      tags,
      repeatTimes,
      installmentCount
    } = req.body;

    const transaction = await FinancialTransactionService.createTransaction({
      description,
      amount,
      date: new Date(date),
      dueDate: dueDate ? new Date(dueDate) : null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      type,
      status,
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      companyId,
      createdBy: userId,
      tags,
      repeatTimes,
      installmentCount
    });

    return res.status(201).json(transaction);
  } catch (error: any) {
    logger.error('Erro ao criar transaÃ§Ã£o financeira:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao criar transaÃ§Ã£o financeira'
    });
  }
}

/**
 * GET /api/financial/transactions
 * Lista transaÃ§Ãµes financeiras com filtros avanÃ§ados
 */
export async function getTransactions(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    // @ts-ignore - auth middleware adiciona
    const { userId, role } = req.user;
    
    const {
      startDate,
      endDate,
      dateField,
      includeCreditCardTransactions,
      includeVirtualFixed,
      type,
      types,
      status,
      accountId,
      categoryId,
      search,
      page,
      pageSize
    } = req.body;

    const accessFilter =
      await UserFinancialAccountAccessService.getAccessibleTransactionFilter(
        userId,
        role,
        companyId
      );

    const accessibleAccountIds =
      role === 'ADMIN' || role === 'SUPERUSER'
        ? undefined
        : await UserFinancialAccountAccessService.getUserAccessibleAccounts(
            userId,
            role,
            companyId
          );

    const normalizedTypes = types ?? (type ? [type] : undefined);

    const result = await FinancialTransactionService.listTransactions({
      companyId,
      startDate,
      endDate,
      dateField,
      includeCreditCardTransactions,
      includeVirtualFixed,
      types: normalizedTypes,
      status,
      accountId,
      categoryId,
      search,
      page,
      pageSize,
      accessFilter,
      accessibleAccountIds
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao listar transacoes financeiras:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao listar transacoes financeiras'
    });
  }
}

/**
 * GET /api/financial/credit-card-purchases
 * Lista compras no cartao agrupadas por compra
 */
export async function getCreditCardPurchases(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    // @ts-ignore - auth middleware adiciona
    const { userId, role } = req.user;
    const { accountIds, page, pageSize } = req.body;

    const accessibleAccountIds =
      role === 'ADMIN' || role === 'SUPERUSER'
        ? undefined
        : await UserFinancialAccountAccessService.getUserAccessibleAccounts(
            userId,
            role,
            companyId
          );

    const result = await FinancialTransactionService.listCreditCardPurchases({
      companyId,
      accountIds,
      page,
      pageSize,
      accessibleAccountIds
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao listar compras no cartao:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao listar compras no cartao'
    });
  }
}

/**
 * GET /api/financial/transactions/:id
 * ObtÃ©m uma transaÃ§Ã£o financeira especÃ­fica pelo ID
 */
export async function getTransactionById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID invÃ¡lido' });
    }

    const transaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'TransaÃ§Ã£o nÃ£o encontrada' });
    }

    // Verificar se pertence Ã  empresa do usuÃ¡rio
    const { companyId } = getUserContext(req);
    if (transaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.status(200).json(transaction);
  } catch (error) {
    logger.error(`Erro ao buscar transaÃ§Ã£o financeira:`, error);
    return res.status(500).json({
      error: 'Erro ao buscar transaÃ§Ã£o financeira'
    });
  }
}

/**
 * PUT /api/financial/transactions/:id
 * Atualiza uma transaÃ§Ã£o financeira
 */
export async function updateTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID invÃ¡lido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se a transaÃ§Ã£o existe e pertence Ã  empresa
    const existingTransaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!existingTransaction) {
      return res.status(404).json({ error: 'TransaÃ§Ã£o nÃ£o encontrada' });
    }

    if (existingTransaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const {
      description,
      amount,
      date,
      dueDate,
      effectiveDate,
      type,
      status,
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      tags,
      purchaseScope
    } = req.body;

    const updateData = {
      description,
      amount,
      date: date ? new Date(date) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
      type,
      status,
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      tags,
      purchaseScope
    };
    const updatedTransaction = await FinancialTransactionService.updateTransaction(
      id,
      updateData,
      companyId
    );

    return res.status(200).json(updatedTransaction);
  } catch (error: any) {
    logger.error(`Erro ao atualizar transaÃ§Ã£o financeira:`, error);
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar transaÃ§Ã£o financeira'
    });
  }
}

/**
 * PATCH /api/financial/transactions/:id/status
 * Atualiza apenas o status de uma transaÃ§Ã£o
 */
export async function updateTransactionStatus(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID invÃ¡lido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se a transaÃ§Ã£o existe e pertence Ã  empresa
    const existingTransaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!existingTransaction) {
      return res.status(404).json({ error: 'TransaÃ§Ã£o nÃ£o encontrada' });
    }

    if (existingTransaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { status } = req.body;
    const updatedTransaction = await FinancialTransactionService.updateTransactionStatus(
      id,
      status,
      companyId
    );

    return res.status(200).json(updatedTransaction);
  } catch (error: any) {
    logger.error(`Erro ao atualizar status da transaÃ§Ã£o:`, error);
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar status da transaÃ§Ã£o'
    });
  }
}

/**
 * DELETE /api/financial/transactions/:id
 * Exclui uma transaÃ§Ã£o financeira
 */
export async function deleteTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID invÃ¡lido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se a transaÃ§Ã£o existe e pertence Ã  empresa
    const existingTransaction = await FinancialTransactionService.getTransactionById(id);
    
    if (!existingTransaction) {
      return res.status(404).json({ error: 'TransaÃ§Ã£o nÃ£o encontrada' });
    }

    if (existingTransaction.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const scope =
      req.query.scope === 'purchase'
        ? 'PURCHASE'
        : req.query.scope === 'future'
          ? 'FUTURE'
        : req.query.scope === 'single'
          ? 'SINGLE'
          : undefined;
    await FinancialTransactionService.deleteTransaction(id, {
      companyId,
      scope
    });
    return res.status(204).send();
  } catch (error: any) {
    logger.error(`Erro ao excluir transaÃ§Ã£o financeira:`, error);
    return res.status(500).json({
      error: error.message || 'Erro ao excluir transaÃ§Ã£o financeira'
    });
  }
}

/**
 * GET /api/financial/summary
 * ObtÃ©m um resumo financeiro para o dashboard
 */
export async function getFinancialSummary(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    // @ts-ignore - auth middleware adiciona
    const { userId, role } = req.user;
    
    // ParÃ¢metros de perÃ­odo (padrÃ£o: mÃªs atual)
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
      // PadrÃ£o: mÃªs atual
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Primeiro dia do mÃªs
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Ãšltimo dia do mÃªs
    }

    const accessibleAccountIds =
      role === 'ADMIN' || role === 'SUPERUSER'
        ? undefined
        : await UserFinancialAccountAccessService.getUserAccessibleAccounts(
            userId,
            role,
            companyId
          );

    const summary = await FinancialTransactionService.getFinancialSummary(
      companyId,
      startDate,
      endDate,
      accessibleAccountIds
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

/**
 * âœ… GET /api/financial/transactions/autocomplete
 * Autocomplete inteligente para descriÃ§Ãµes de transaÃ§Ãµes filtrado por tipo
 */
export async function getTransactionAutocomplete(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { q, type, limit } = req.query; // âœ… ADICIONAR PARÃ‚METRO TYPE

    // ValidaÃ§Ã£o de entrada
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ 
        error: 'ParÃ¢metro q Ã© obrigatÃ³rio e deve ser uma string' 
      });
    }

    if (q.length < 3) {
      return res.status(400).json({ 
        error: 'Query deve ter pelo menos 3 caracteres' 
      });
    }

    // âœ… VALIDAR TIPO DE TRANSAÃ‡ÃƒO
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ 
        error: 'ParÃ¢metro type Ã© obrigatÃ³rio (INCOME, EXPENSE, TRANSFER)' 
      });
    }

    const validTypes = ['INCOME', 'EXPENSE', 'TRANSFER'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({ 
        error: 'Tipo de transaÃ§Ã£o invÃ¡lido. Use: INCOME, EXPENSE ou TRANSFER' 
      });
    }

    const transactionType = type.toUpperCase() as 'INCOME' | 'EXPENSE' | 'TRANSFER';

    // Validar limite (opcional)
    const maxResults = limit && typeof limit === 'string' 
      ? Math.min(parseInt(limit), 20) // MÃ¡ximo 20 resultados
      : 10; // PadrÃ£o 10

    // âœ… DELEGAR LÃ“GICA PARA O SERVICE COM FILTRO POR TIPO
    const suggestions = await FinancialTransactionService.getDescriptionSuggestions(
      companyId,
      q,
      transactionType, // âœ… PASSAR O TIPO
      maxResults
    );

    return res.status(200).json({
      suggestions,
      query: q,
      type: transactionType, // âœ… RETORNAR O TIPO USADO
      total: suggestions.length
    });

  } catch (error: any) {
    logger.error('Error in autocomplete controller', {
      error: error.message,
      stack: error.stack,
      query: req.query
    });
    
    return res.status(500).json({
      error: 'Erro interno ao buscar sugestÃµes'
    });
  }
}

