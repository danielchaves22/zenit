import { Request, Response } from 'express';
import FinancialResetService from '../services/financial-reset.service';
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

export async function previewFinancialReset(req: Request, res: Response) {
  try {
    const { companyId } = getResetContext(req);
    const preview = await FinancialResetService.getResetPreview(companyId);
    return res.status(200).json(preview);
  } catch (error: any) {
    logger.error('Erro ao gerar previa do reset financeiro:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao gerar previa do reset financeiro'
    });
  }
}

export async function executeFinancialReset(req: Request, res: Response) {
  try {
    const { companyId, userId } = getResetContext(req);
    const { confirmationText } = req.body;

    if (confirmationText !== 'RESETAR') {
      return res.status(400).json({
        error: 'Texto de confirmacao invalido. Digite RESETAR para continuar.'
      });
    }

    const result = await FinancialResetService.executeReset({
      companyId,
      actorUserId: userId
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao executar reset financeiro:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao executar reset financeiro'
    });
  }
}
