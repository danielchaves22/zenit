import { Request, Response } from 'express';
import CreditCardStatementReconciliationService, {
  CreditCardReconciliationItemCommitError
} from '../services/credit-card-statement-reconciliation.service';
import CreditCardReconciliationSessionService, {
  CreditCardReconciliationSessionError
} from '../services/credit-card-reconciliation-session.service';
import { CreditCardReconciliationValueAnalysisError } from '../services/credit-card-reconciliation-value-analysis.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore
  const { companyId, userId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return { companyId, userId };
}

function handleSessionError(res: Response, error: any, fallback: string) {
  logger.error(fallback, error);

  if (error instanceof CreditCardReconciliationItemCommitError) {
    return res.status(400).json({
      error: error.message,
      code: 'ITEM_COMMIT_FAILED',
      itemId: error.itemId
    });
  }

  if (error instanceof CreditCardReconciliationSessionError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.currentRevision === undefined
        ? {}
        : { currentRevision: error.currentRevision }),
      ...(error.currentSessionId === undefined
        ? {}
        : { currentSessionId: error.currentSessionId })
    });
  }

  if (error instanceof CreditCardReconciliationValueAnalysisError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code
    });
  }

  return res.status(400).json({
    error: error.message || fallback
  });
}

export async function previewCreditCardReconciliation(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const { sourceType, targetReferenceYear, targetReferenceMonth, fileBase64, fileName } = req.body;

    const preview = await CreditCardStatementReconciliationService.buildPreview({
      accountId,
      companyId,
      sourceType,
      targetReferenceYear,
      targetReferenceMonth,
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
  return res.status(409).json({
    error: 'Use uma sessao persistida para confirmar a conciliacao de cartao',
    code: 'PERSISTED_RECONCILIATION_SESSION_REQUIRED'
  });
}

export async function startCreditCardReconciliationSession(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const workspace = await CreditCardReconciliationSessionService.start(
      { accountId, companyId, userId },
      req.body
    );
    return res.status(200).json(workspace);
  } catch (error: any) {
    return handleSessionError(res, error, 'Erro ao iniciar conciliacao persistida de cartao');
  }
}

export async function getCreditCardReconciliationSession(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const workspace = await CreditCardReconciliationSessionService.get(
      { accountId, companyId, userId },
      Number(req.params.referenceYear),
      Number(req.params.referenceMonth)
    );
    return res.status(200).json(workspace);
  } catch (error: any) {
    return handleSessionError(res, error, 'Erro ao retomar conciliacao persistida de cartao');
  }
}

export async function analyzeCreditCardReconciliationValues(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const result = await CreditCardReconciliationSessionService.analyzeValues(
      { accountId, companyId, userId },
      Number(req.params.sessionId),
      req.body.expectedRevision
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return handleSessionError(res, error, 'Erro ao solicitar parecer da IA para a conciliacao');
  }
}

export async function commitCreditCardReconciliationSession(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const workspace = await CreditCardReconciliationSessionService.commit(
      { accountId, companyId, userId },
      Number(req.params.sessionId),
      req.body.expectedRevision,
      req.body.selectedItems
    );
    return res.status(200).json(workspace);
  } catch (error: any) {
    return handleSessionError(res, error, 'Erro ao confirmar itens da conciliacao persistida de cartao');
  }
}

export async function decideCreditCardReconciliationItem(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const workspace = await CreditCardReconciliationSessionService.decide(
      { accountId, companyId, userId },
      Number(req.params.sessionId),
      req.params.itemId,
      req.body
    );
    return res.status(200).json(workspace);
  } catch (error: any) {
    return handleSessionError(res, error, 'Erro ao salvar decisao da conciliacao de cartao');
  }
}

export async function updateCreditCardReconciliationSessionStatus(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const workspace = await CreditCardReconciliationSessionService.updateStatus(
      { accountId, companyId, userId },
      Number(req.params.sessionId),
      req.body.expectedRevision,
      req.body.status
    );
    return res.status(200).json(workspace);
  } catch (error: any) {
    return handleSessionError(res, error, 'Erro ao alterar status da conciliacao de cartao');
  }
}

export async function resetCreditCardReconciliationSession(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const accountId = Number(req.params.accountId);
    const result = await CreditCardReconciliationSessionService.reset(
      { accountId, companyId, userId },
      Number(req.params.sessionId),
      req.body.expectedRevision
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return handleSessionError(res, error, 'Erro ao reiniciar conciliacao persistida de cartao');
  }
}
