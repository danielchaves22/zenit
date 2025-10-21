import { Request, Response } from 'express';
import CreditCardConfigService from '../services/credit-card-config.service';
import CreditCardInvoiceService from '../services/credit-card-invoice.service';
import CreditCardInstallmentService from '../services/credit-card-installment.service';
import CreditCardPaymentService from '../services/credit-card-payment.service';
import { logger } from '../utils/logger';

/**
 * Helper para extrair contexto do usuário
 */
function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore
  const { companyId, userId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa não encontrado');
  }

  return { companyId, userId };
}

// ============================================
// CREDIT CARD CONFIG CONTROLLERS
// ============================================

/**
 * POST /api/financial/accounts/:accountId/credit-card/config
 * Cria configuração de cartão de crédito
 */
export async function createConfig(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const config = await CreditCardConfigService.create({
      financialAccountId: accountId,
      ...req.body
    });

    return res.status(201).json(config);
  } catch (error: any) {
    logger.error('Error creating credit card config:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao criar configuração de cartão'
    });
  }
}

/**
 * GET /api/financial/accounts/:accountId/credit-card/config
 * Busca configuração de cartão
 */
export async function getConfig(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const config = await CreditCardConfigService.getByAccountId(accountId);
    if (!config) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    return res.status(200).json(config);
  } catch (error: any) {
    logger.error('Error getting credit card config:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar configuração'
    });
  }
}

/**
 * PUT /api/financial/accounts/:accountId/credit-card/config
 * Atualiza configuração de cartão
 */
export async function updateConfig(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const config = await CreditCardConfigService.update(accountId, req.body);
    return res.status(200).json(config);
  } catch (error: any) {
    logger.error('Error updating credit card config:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar configuração'
    });
  }
}

/**
 * DELETE /api/financial/accounts/:accountId/credit-card/config
 * Deleta configuração de cartão
 */
export async function deleteConfig(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    await CreditCardConfigService.delete(accountId);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Error deleting credit card config:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao deletar configuração'
    });
  }
}

/**
 * GET /api/financial/accounts/:accountId/credit-card/available-limit
 * Obtém limite disponível
 */
export async function getAvailableLimit(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const availableLimit = await CreditCardConfigService.getAvailableLimit(accountId);
    return res.status(200).json({ availableLimit });
  } catch (error: any) {
    logger.error('Error getting available limit:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar limite disponível'
    });
  }
}

/**
 * GET /api/financial/credit-cards/company/:companyId/all
 * Lista todos os cartões de uma empresa
 */
export async function listCompanyCards(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const includeInactive = req.query.includeInactive === 'true';

    const cards = await CreditCardConfigService.listByCompany(companyId, includeInactive);
    return res.status(200).json(cards);
  } catch (error: any) {
    logger.error('Error listing company cards:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao listar cartões'
    });
  }
}

// ============================================
// INVOICE CONTROLLERS
// ============================================

/**
 * POST /api/financial/credit-cards/:accountId/invoices/generate
 * Gera uma nova fatura
 */
export async function generateInvoice(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const { referenceMonth, referenceYear } = req.body;

    const invoice = await CreditCardInvoiceService.generateInvoice(
      accountId,
      referenceMonth,
      referenceYear
    );

    return res.status(201).json(invoice);
  } catch (error: any) {
    logger.error('Error generating invoice:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao gerar fatura'
    });
  }
}

/**
 * GET /api/financial/credit-cards/:accountId/invoices
 * Lista faturas de um cartão
 */
export async function listInvoices(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const { status, limit, offset } = req.query;

    const invoices = await CreditCardInvoiceService.listInvoices(accountId, {
      status: status as any,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });

    return res.status(200).json(invoices);
  } catch (error: any) {
    logger.error('Error listing invoices:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao listar faturas'
    });
  }
}

/**
 * GET /api/financial/credit-cards/:accountId/invoices/current
 * Busca fatura atual (aberta)
 */
export async function getCurrentInvoice(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const invoice = await CreditCardInvoiceService.getCurrentInvoice(accountId);
    if (!invoice) {
      return res.status(404).json({ error: 'Nenhuma fatura aberta encontrada' });
    }

    return res.status(200).json(invoice);
  } catch (error: any) {
    logger.error('Error getting current invoice:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar fatura atual'
    });
  }
}

/**
 * GET /api/financial/credit-cards/invoices/:invoiceId
 * Busca fatura por ID
 */
export async function getInvoiceById(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Fatura não encontrada' });
    }

    return res.status(200).json(invoice);
  } catch (error: any) {
    logger.error('Error getting invoice:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar fatura'
    });
  }
}

/**
 * POST /api/financial/credit-cards/invoices/:invoiceId/close
 * Fecha uma fatura
 */
export async function closeInvoice(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const invoice = await CreditCardInvoiceService.closeInvoice(invoiceId);
    return res.status(200).json(invoice);
  } catch (error: any) {
    logger.error('Error closing invoice:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao fechar fatura'
    });
  }
}

/**
 * GET /api/financial/credit-cards/invoices/:invoiceId/transactions
 * Lista transações de uma fatura
 */
export async function getInvoiceTransactions(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const transactions = await CreditCardInvoiceService.getInvoiceTransactions(invoiceId);
    return res.status(200).json(transactions);
  } catch (error: any) {
    logger.error('Error getting invoice transactions:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar transações'
    });
  }
}

/**
 * POST /api/financial/credit-cards/invoices/:invoiceId/transactions
 * Adiciona transação à fatura
 */
export async function addTransactionToInvoice(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const { transactionId, installmentId } = req.body;

    await CreditCardInvoiceService.addTransactionToInvoice(
      invoiceId,
      transactionId,
      installmentId
    );

    return res.status(201).json({ message: 'Transação adicionada à fatura' });
  } catch (error: any) {
    logger.error('Error adding transaction to invoice:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao adicionar transação'
    });
  }
}

// ============================================
// INSTALLMENT CONTROLLERS
// ============================================

/**
 * POST /api/financial/credit-cards/:accountId/installments
 * Cria uma compra parcelada
 */
export async function createInstallment(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const { companyId, userId } = getUserContext(req);

    const result = await CreditCardInstallmentService.createInstallmentPurchase({
      accountId,
      companyId,
      createdBy: userId,
      ...req.body
    });

    return res.status(201).json(result);
  } catch (error: any) {
    logger.error('Error creating installment:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao criar parcelamento'
    });
  }
}

/**
 * GET /api/financial/credit-cards/:accountId/installments
 * Lista parcelamentos de um cartão
 */
export async function listInstallments(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const installments = await CreditCardInstallmentService.listByAccount(accountId);
    return res.status(200).json(installments);
  } catch (error: any) {
    logger.error('Error listing installments:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao listar parcelamentos'
    });
  }
}

/**
 * GET /api/financial/credit-cards/installments/:installmentId
 * Busca parcelamento por ID
 */
export async function getInstallmentById(req: Request, res: Response) {
  try {
    const installmentId = Number(req.params.installmentId);
    if (isNaN(installmentId)) {
      return res.status(400).json({ error: 'ID de parcelamento inválido' });
    }

    const installment = await CreditCardInstallmentService.getById(installmentId);
    if (!installment) {
      return res.status(404).json({ error: 'Parcelamento não encontrado' });
    }

    return res.status(200).json(installment);
  } catch (error: any) {
    logger.error('Error getting installment:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar parcelamento'
    });
  }
}

/**
 * DELETE /api/financial/credit-cards/installments/:installmentId
 * Cancela um parcelamento
 */
export async function cancelInstallment(req: Request, res: Response) {
  try {
    const installmentId = Number(req.params.installmentId);
    if (isNaN(installmentId)) {
      return res.status(400).json({ error: 'ID de parcelamento inválido' });
    }

    await CreditCardInstallmentService.cancelInstallment(installmentId);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Error canceling installment:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao cancelar parcelamento'
    });
  }
}

// ============================================
// PAYMENT CONTROLLERS
// ============================================

/**
 * POST /api/financial/credit-cards/invoices/:invoiceId/payments/full
 * Paga fatura completamente
 */
export async function payInvoiceFull(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const { userId } = getUserContext(req);

    const payment = await CreditCardPaymentService.payInvoiceFull(invoiceId, {
      ...req.body,
      userId
    });

    return res.status(201).json(payment);
  } catch (error: any) {
    logger.error('Error paying invoice full:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao pagar fatura'
    });
  }
}

/**
 * POST /api/financial/credit-cards/invoices/:invoiceId/payments/minimum
 * Paga valor mínimo da fatura
 */
export async function payInvoiceMinimum(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const { userId } = getUserContext(req);

    const payment = await CreditCardPaymentService.payInvoiceMinimum(invoiceId, {
      ...req.body,
      userId
    });

    return res.status(201).json(payment);
  } catch (error: any) {
    logger.error('Error paying invoice minimum:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao pagar fatura'
    });
  }
}

/**
 * POST /api/financial/credit-cards/invoices/:invoiceId/payments/partial
 * Paga valor parcial da fatura
 */
export async function payInvoicePartial(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const { userId } = getUserContext(req);
    const { amount, ...rest } = req.body;

    const payment = await CreditCardPaymentService.payInvoicePartial(invoiceId, amount, {
      ...rest,
      userId
    });

    return res.status(201).json(payment);
  } catch (error: any) {
    logger.error('Error paying invoice partial:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao pagar fatura'
    });
  }
}

/**
 * GET /api/financial/credit-cards/invoices/:invoiceId/payments
 * Lista pagamentos de uma fatura
 */
export async function getInvoicePayments(req: Request, res: Response) {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'ID de fatura inválido' });
    }

    const payments = await CreditCardPaymentService.getInvoicePayments(invoiceId);
    return res.status(200).json(payments);
  } catch (error: any) {
    logger.error('Error getting invoice payments:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar pagamentos'
    });
  }
}

/**
 * GET /api/financial/credit-cards/:accountId/payment-history
 * Busca histórico de pagamentos
 */
export async function getPaymentHistory(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const { startDate, endDate, limit } = req.query;

    const payments = await CreditCardPaymentService.getPaymentHistory(accountId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? Number(limit) : undefined
    });

    return res.status(200).json(payments);
  } catch (error: any) {
    logger.error('Error getting payment history:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar histórico'
    });
  }
}
