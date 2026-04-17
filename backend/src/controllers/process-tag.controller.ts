import { Request, Response } from 'express';
import ProcessTagService from '../services/process-tag.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number } {
  // @ts-ignore - populated by middlewares
  const { companyId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa invalido.');
  }

  return { companyId };
}

export async function createProcessTag(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { name } = req.body;

    const tag = await ProcessTagService.createTag(companyId, name);
    return res.status(201).json(tag);
  } catch (error: any) {
    logger.error('Erro ao criar tag de processo:', error);

    if (error.message?.includes('Ja existe')) {
      return res.status(409).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao criar tag de processo.' });
  }
}

export async function listProcessTags(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { search, limit } = req.body;

    const tags = await ProcessTagService.listTags(companyId, search, limit);
    return res.status(200).json(tags);
  } catch (error) {
    logger.error('Erro ao listar tags de processo:', error);
    return res.status(500).json({ error: 'Erro ao listar tags de processo.' });
  }
}
