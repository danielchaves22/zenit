import { Request, Response } from 'express';
import FinancialTagService from '../services/financial-tag.service';
import { ListFinancialTagsQuery } from '../validators/financial-tag.validator';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number } {
  // @ts-ignore - populated by auth and tenant middlewares
  const { companyId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa invalido.');
  }

  return { companyId };
}

export async function listFinancialTags(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { search, limit } = req.query as unknown as ListFinancialTagsQuery;

    const tags = await FinancialTagService.listTags(companyId, search, limit);
    return res.status(200).json({ tags });
  } catch (error) {
    logger.error('Erro ao listar tags financeiras:', error);
    return res.status(500).json({ error: 'Erro ao listar tags financeiras.' });
  }
}
