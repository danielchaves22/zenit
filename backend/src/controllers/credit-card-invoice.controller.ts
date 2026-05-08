import { Request, Response } from 'express';
import CreditCardInvoiceService from '../services/credit-card-invoice.service';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number; role: string } {
  // @ts-ignore
  const { companyId, userId, role } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa não encontrado');
  }

  return { companyId, userId, role };
}

export async function listCreditCards(req: Request, res: Response) {
  try {
    const { companyId, userId, role } = getUserContext(req);
    const accessibleAccountIds =
      await UserFinancialAccountAccessService.getUserAccessibleAccounts(
        userId,
        role,
        companyId
      );

    const cards = await CreditCardInvoiceService.listCreditCards({
      companyId,
      accountIds: accessibleAccountIds
    });

    return res.status(200).json(cards);
  } catch (error: any) {
    logger.error('Erro ao listar cartões de crédito:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao listar cartões de crédito'
    });
  }
}

export async function listCreditCardInvoices(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const accountId = Number(req.params.accountId);

    const invoices = await CreditCardInvoiceService.listInvoicesByAccount({
      accountId,
      companyId
    });

    return res.status(200).json(invoices);
  } catch (error: any) {
    logger.error('Erro ao listar faturas do cartão:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao listar faturas do cartão'
    });
  }
}

export async function getCreditCardInvoice(req: Request, res: Response) {
  try {
    const { companyId, userId, role } = getUserContext(req);
    const invoiceId = Number(req.params.id);

    const invoice = await CreditCardInvoiceService.getInvoiceById(invoiceId, companyId);
    if (!invoice) {
      return res.status(404).json({ error: 'Fatura não encontrada' });
    }

    const hasAccess = await UserFinancialAccountAccessService.checkUserAccountAccess(
      userId,
      invoice.accountId,
      role,
      companyId
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta fatura' });
    }

    return res.status(200).json(invoice);
  } catch (error: any) {
    logger.error('Erro ao obter detalhe da fatura:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao obter detalhe da fatura'
    });
  }
}

export async function getProjectedCreditCardInvoice(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const projectionKey = String(req.params.projectionKey);

    const invoice = await CreditCardInvoiceService.getProjectedInvoiceByKey({
      accountId,
      projectionKey,
      companyId
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Fatura projetada não encontrada' });
    }

    return res.status(200).json(invoice);
  } catch (error: any) {
    logger.error('Erro ao obter detalhe da fatura projetada:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao obter detalhe da fatura projetada'
    });
  }
}

export async function payCreditCardInvoice(req: Request, res: Response) {
  try {
    const { companyId, userId, role } = getUserContext(req);
    const invoiceId = Number(req.params.id);
    const { fromAccountId, paymentDate, notes } = req.body;

    const preview = await CreditCardInvoiceService.getInvoiceById(invoiceId, companyId);
    if (!preview) {
      return res.status(404).json({ error: 'Fatura não encontrada' });
    }

    const [hasCardAccess, hasSourceAccess] = await Promise.all([
      UserFinancialAccountAccessService.checkUserAccountAccess(
        userId,
        preview.accountId,
        role,
        companyId
      ),
      UserFinancialAccountAccessService.checkUserAccountAccess(
        userId,
        fromAccountId,
        role,
        companyId
      )
    ]);

    if (!hasCardAccess || !hasSourceAccess) {
      return res.status(403).json({ error: 'Acesso negado para pagar esta fatura' });
    }

    const paidInvoice = await CreditCardInvoiceService.payInvoice({
      invoiceId,
      fromAccountId,
      paymentDate,
      notes,
      companyId,
      userId
    });

    return res.status(200).json(paidInvoice);
  } catch (error: any) {
    logger.error('Erro ao pagar fatura do cartão:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao pagar fatura do cartão'
    });
  }
}
