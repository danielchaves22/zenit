import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import SavedFilterPresetService from '../services/saved-filter-preset.service';
import { logger } from '../utils/logger';

function getRequestContext(req: Request) {
  const userId = req.user?.userId;
  const companyId = req.user?.companyId;

  if (!userId || !companyId) {
    throw new Error('Contexto de usuario ou empresa invalido');
  }

  return { userId, companyId };
}

function isPresetNotFoundError(error: unknown) {
  return error instanceof Error && error.message === 'Preset de filtro nao encontrado';
}

export async function listSavedFilterPresets(req: Request, res: Response) {
  try {
    const { userId, companyId } = getRequestContext(req);
    const { featureKey } = req.query as { featureKey: string };

    const result = await SavedFilterPresetService.list({
      userId,
      companyId,
      featureKey
    });

    return res.status(200).json(result);
  } catch (error: unknown) {
    logger.error('Erro ao listar presets de filtro', { error });
    return res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Erro ao listar presets de filtro'
    });
  }
}

export async function createSavedFilterPreset(req: Request, res: Response) {
  try {
    const { userId, companyId } = getRequestContext(req);
    const { featureKey, name, payload } = req.body as {
      featureKey: string;
      name: string;
      payload: Record<string, unknown>;
    };

    const result = await SavedFilterPresetService.create({
      userId,
      companyId,
      featureKey,
      name,
      payload: payload as Prisma.InputJsonObject
    });

    return res.status(201).json(result);
  } catch (error: unknown) {
    logger.error('Erro ao criar preset de filtro', { error });
    return res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Erro ao criar preset de filtro'
    });
  }
}

export async function markLastUsedFilterPreset(req: Request, res: Response) {
  try {
    const { userId, companyId } = getRequestContext(req);
    const presetId = Number(req.params.id);

    const result = await SavedFilterPresetService.markLastUsed({
      userId,
      companyId,
      presetId
    });

    return res.status(200).json(result);
  } catch (error: unknown) {
    logger.error('Erro ao marcar preset de filtro como ultimo usado', { error });

    if (isPresetNotFoundError(error)) {
      return res.status(404).json({ error: 'Preset de filtro nao encontrado' });
    }

    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao marcar preset de filtro como ultimo usado'
    });
  }
}

export async function deleteSavedFilterPreset(req: Request, res: Response) {
  try {
    const { userId, companyId } = getRequestContext(req);
    const presetId = Number(req.params.id);

    const result = await SavedFilterPresetService.delete({
      userId,
      companyId,
      presetId
    });

    return res.status(200).json(result);
  } catch (error: unknown) {
    logger.error('Erro ao excluir preset de filtro', { error });

    if (isPresetNotFoundError(error)) {
      return res.status(404).json({ error: 'Preset de filtro nao encontrado' });
    }

    return res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Erro ao excluir preset de filtro'
    });
  }
}
