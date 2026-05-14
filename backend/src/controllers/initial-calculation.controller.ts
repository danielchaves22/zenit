import { Request, Response } from 'express';
import { FgtsRegime } from '@prisma/client';

import InitialCalculationService from '../services/initial-calculation.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - populated by middlewares
  const { companyId, userId } = req.user;

  if (!companyId || !userId) {
    throw new Error('Contexto de usuario invalido.');
  }

  return { companyId, userId };
}

function parseId(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} invalido.`);
  }

  return parsed;
}

function isNotFoundError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('nao encontrado');
}

export async function getInitialCalculation(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const result = await InitialCalculationService.getInitialCalculation(processId, companyId);

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao buscar calculo inicial:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao buscar calculo inicial.' });
  }
}

export async function getInitialCalculationCatalog(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const result = await InitialCalculationService.getCatalog(processId, companyId);

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao buscar catalogo do calculo inicial:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao buscar catalogo do calculo inicial.' });
  }
}

export async function listProcessCustomVerbas(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const result = await InitialCalculationService.listProcessCustomVerbas(processId, companyId);

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao listar verbas do processo:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao listar verbas do processo.' });
  }
}

export async function createProcessCustomVerba(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const {
      id,
      code,
      label,
      groupCode,
      groupLabel,
      strategy,
      fgtsMode,
      configJson,
      inputSchemaJson,
      sortOrder,
      isActive
    } = req.body;

    const created = await InitialCalculationService.createProcessCustomVerba({
      processId: parseId(id, 'ID do processo'),
      companyId,
      createdBy: userId,
      code,
      label,
      groupCode,
      groupLabel,
      strategy,
      fgtsMode,
      configJson,
      inputSchemaJson,
      sortOrder,
      isActive
    });

    return res.status(201).json(created);
  } catch (error: any) {
    logger.error('Erro ao criar verba do processo:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao criar verba do processo.' });
  }
}

export async function updateProcessCustomVerba(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const {
      id,
      verbaId,
      code,
      label,
      groupCode,
      groupLabel,
      strategy,
      fgtsMode,
      configJson,
      inputSchemaJson,
      sortOrder,
      isActive
    } = req.body;

    const updated = await InitialCalculationService.updateProcessCustomVerba({
      processId: parseId(id, 'ID do processo'),
      companyId,
      verbaId: parseId(verbaId, 'ID da verba'),
      updatedBy: userId,
      code,
      label,
      groupCode,
      groupLabel,
      strategy,
      fgtsMode,
      configJson,
      inputSchemaJson,
      sortOrder,
      isActive
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    logger.error('Erro ao atualizar verba do processo:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao atualizar verba do processo.' });
  }
}

export async function deleteProcessCustomVerba(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const verbaId = parseId(req.params.verbaId, 'ID da verba');

    await InitialCalculationService.deleteProcessCustomVerba(processId, companyId, verbaId);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Erro ao excluir verba do processo:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao excluir verba do processo.' });
  }
}

export async function createInitialCalculation(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const { id, fgtsRegime, inputs, publish, disabledVerbaCodes } = req.body;

    const result = await InitialCalculationService.createInitialCalculationVersion({
      processId: parseId(id, 'ID do processo'),
      companyId,
      createdBy: userId,
      fgtsRegime: fgtsRegime as FgtsRegime,
      inputs,
      publish,
      disabledVerbaCodes
    });

    return res.status(201).json(result);
  } catch (error: any) {
    logger.error('Erro ao criar calculo inicial:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao criar calculo inicial.' });
  }
}

export async function createInitialCalculationVersion(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const { id, calculationId, fgtsRegime, inputs, publish, disabledVerbaCodes } = req.body;

    const result = await InitialCalculationService.createInitialCalculationVersion({
      processId: parseId(id, 'ID do processo'),
      companyId,
      createdBy: userId,
      calculationId: parseId(calculationId, 'ID do calculo inicial'),
      fgtsRegime: fgtsRegime as FgtsRegime,
      inputs,
      publish,
      disabledVerbaCodes
    });

    return res.status(201).json(result);
  } catch (error: any) {
    logger.error('Erro ao criar versao do calculo inicial:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao criar versao do calculo inicial.' });
  }
}

export async function listInitialCalculationVersions(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const calculationId = parseId(req.params.calculationId, 'ID do calculo inicial');

    const result = await InitialCalculationService.listInitialCalculationVersions(processId, companyId, calculationId);
    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao listar versoes do calculo inicial:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao listar versoes do calculo inicial.' });
  }
}

export async function publishInitialCalculationVersion(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const calculationId = parseId(req.params.calculationId, 'ID do calculo inicial');
    const versionId = parseId(req.params.versionId, 'ID da versao');

    const result = await InitialCalculationService.publishInitialCalculationVersion({
      processId,
      companyId,
      calculationId,
      versionId,
      changedBy: userId
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao publicar versao do calculo inicial:', error);

    if (isNotFoundError(error)) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao publicar versao do calculo inicial.' });
  }
}
