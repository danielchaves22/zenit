import { Request, Response } from 'express';
import CreditCardResetService from '../services/credit-card-reset.service';
import { logger } from '../utils/logger';

function getResetContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - populated by auth + tenant middlewares
  const { companyId, userId } = req.user;

  if (!companyId || !userId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return {
    companyId,
    userId
  };
}

function getAccountId(req: Request): number {
  const accountId = Number(req.params.accountId);

  if (Number.isNaN(accountId)) {
    throw new Error('ID de cartao invalido');
  }

  return accountId;
}

function getStatusCode(message?: string): number {
  if (!message) {
    return 500;
  }

  if (message.includes('nao encontrado')) {
    return 404;
  }

  if (message.includes('nao e um cartao de credito') || message.includes('invalido')) {
    return 400;
  }

  return 500;
}

export async function previewCreditCardReset(req: Request, res: Response) {
  try {
    const { companyId } = getResetContext(req);
    const accountId = getAccountId(req);
    const preview = await CreditCardResetService.getResetPreview(companyId, accountId);

    return res.status(200).json(preview);
  } catch (error: any) {
    logger.error('Erro ao gerar previa do reset do cartao:', error);
    return res.status(getStatusCode(error.message)).json({
      error: error.message || 'Erro ao gerar previa do reset do cartao'
    });
  }
}

export async function executeCreditCardReset(req: Request, res: Response) {
  try {
    const { companyId, userId } = getResetContext(req);
    const accountId = getAccountId(req);
    const { confirmationText } = req.body;

    if (confirmationText !== 'RESETAR') {
      return res.status(400).json({
        error: 'Texto de confirmacao invalido. Digite RESETAR para continuar.'
      });
    }

    const result = await CreditCardResetService.executeReset({
      companyId,
      accountId,
      actorUserId: userId
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao executar reset do cartao:', error);
    return res.status(getStatusCode(error.message)).json({
      error: error.message || 'Erro ao executar reset do cartao'
    });
  }
}
