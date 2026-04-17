import { Request, Response } from 'express';
import { ProcessOriginType, ProcessStatus } from '@prisma/client';
import ProcessService from '../services/process.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - populated by middlewares
  const { companyId, userId } = req.user;

  if (!companyId || !userId) {
    throw new Error('Contexto de usuario invalido.');
  }

  return { companyId, userId };
}

function parseId(value: string, fieldName: string): number {
  const parsed = Number(value);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} invalido.`);
  }
  return parsed;
}

function parseTagIds(tagIdsRaw?: string): number[] {
  if (!tagIdsRaw) return [];

  return Array.from(
    new Set(
      tagIdsRaw
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
}

export async function createProcess(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const {
      status,
      requestingLawyerName,
      claimantName,
      notes,
      originType,
      sourceImportId,
      tagIds
    } = req.body;

    const process = await ProcessService.createProcess({
      companyId,
      status: status as ProcessStatus,
      requestingLawyerName,
      claimantName,
      notes,
      originType: originType as ProcessOriginType | undefined,
      sourceImportId,
      tagIds,
      createdBy: userId
    });

    return res.status(201).json(process);
  } catch (error: any) {
    logger.error('Erro ao criar processo:', error);
    return res.status(400).json({ error: error.message || 'Erro ao criar processo.' });
  }
}

export async function listProcesses(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      status,
      startDate,
      endDate,
      search,
      tagIds,
      tagMatchMode,
      page,
      pageSize
    } = req.body;

    const result = await ProcessService.listProcesses({
      companyId,
      status: status as ProcessStatus | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search,
      tagIds: parseTagIds(tagIds),
      tagMatchMode: tagMatchMode === 'ALL' ? 'ALL' : 'ANY',
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao listar processos:', error);
    return res.status(500).json({ error: 'Erro ao listar processos.' });
  }
}

export async function getProcessById(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const id = parseId(req.params.id, 'ID');

    const process = await ProcessService.getProcessById(id, companyId);

    if (!process) {
      return res.status(404).json({ error: 'Processo nao encontrado.' });
    }

    return res.status(200).json(process);
  } catch (error: any) {
    logger.error('Erro ao buscar processo por ID:', error);

    if (error.message?.includes('invalido')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Erro ao buscar processo.' });
  }
}

export async function updateProcess(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const id = parseId(req.params.id, 'ID');

    const {
      status,
      requestingLawyerName,
      claimantName,
      notes,
      originType,
      sourceImportId,
      tagIds,
      statusReason
    } = req.body;

    const updated = await ProcessService.updateProcess({
      id,
      companyId,
      status: status as ProcessStatus | undefined,
      requestingLawyerName,
      claimantName,
      notes,
      originType: originType as ProcessOriginType | undefined,
      sourceImportId,
      tagIds,
      statusReason,
      updatedBy: userId
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    logger.error('Erro ao atualizar processo:', error);

    if (error.message?.includes('nao encontrado')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao atualizar processo.' });
  }
}

export async function updateProcessStatus(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const id = parseId(req.params.id, 'ID');
    const { status, reason } = req.body;

    const updated = await ProcessService.updateProcessStatus({
      id,
      companyId,
      toStatus: status as ProcessStatus,
      changedBy: userId,
      reason
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    logger.error('Erro ao atualizar status do processo:', error);

    if (error.message?.includes('nao encontrado')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao atualizar status do processo.' });
  }
}

export async function deleteProcess(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);
    const id = parseId(req.params.id, 'ID');

    await ProcessService.softDeleteProcess(id, companyId, userId);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Erro ao excluir processo:', error);

    if (error.message?.includes('nao encontrado')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao excluir processo.' });
  }
}

export async function getProcessStatusHistory(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const id = parseId(req.params.id, 'ID');

    const history = await ProcessService.getStatusHistory(id, companyId);
    return res.status(200).json(history);
  } catch (error: any) {
    logger.error('Erro ao buscar historico de status do processo:', error);

    if (error.message?.includes('nao encontrado')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao buscar historico de status.' });
  }
}

export async function addProcessTag(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const tagId = parseId(req.params.tagId, 'ID da tag');

    await ProcessService.addTagToProcess(processId, tagId, companyId);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Erro ao associar tag ao processo:', error);

    if (error.message?.includes('nao encontrado')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao associar tag ao processo.' });
  }
}

export async function removeProcessTag(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const processId = parseId(req.params.id, 'ID do processo');
    const tagId = parseId(req.params.tagId, 'ID da tag');

    await ProcessService.removeTagFromProcess(processId, tagId, companyId);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Erro ao remover tag do processo:', error);

    if (error.message?.includes('nao encontrado')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao remover tag do processo.' });
  }
}
