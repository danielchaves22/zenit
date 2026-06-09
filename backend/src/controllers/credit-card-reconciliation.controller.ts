import { Request, Response } from 'express';
import CreditCardStatementReconciliationService from '../services/credit-card-statement-reconciliation.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore
  const { companyId, userId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return { companyId, userId };
}

export async function previewCreditCardReconciliation(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const { sourceType, fileBase64, fileName } = req.body;

    const preview = await CreditCardStatementReconciliationService.buildPreview({
      accountId,
      companyId,
      sourceType,
      fileBase64,
      fileName
    });

    return res.status(200).json(preview);
  } catch (error: any) {
    logger.error('Erro ao gerar previa da conciliacao de cartao:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao gerar previa da conciliacao de cartao'
    });
  }
}

export async function commitCreditCardReconciliation(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const { sourceType, fileBase64, fileName, selectedItems } = req.body;

    const result = await CreditCardStatementReconciliationService.commit({
      accountId,
      companyId,
      userId,
      sourceType,
      fileBase64,
      fileName,
      selectedItems
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao confirmar conciliacao de cartao:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao confirmar conciliacao de cartao'
    });
  }
}
