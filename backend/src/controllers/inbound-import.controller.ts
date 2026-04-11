import { Request, Response } from 'express';
import {
  InboundImportDestinationType,
  InboundImportSourceType,
  Prisma
} from '@prisma/client';
import InboundImportService from '../services/inbound-import.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number } {
  // @ts-ignore - populated by middlewares
  const { companyId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa inválido.');
  }

  return { companyId };
}

function parseId(value: string): number {
  const parsed = Number(value);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error('ID inválido.');
  }
  return parsed;
}

export async function createInboundImport(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      sourceType,
      externalId,
      payloadMetadata,
      destinationType,
      destinationId
    } = req.body;

    const created = await InboundImportService.createInboundImport({
      companyId,
      sourceType: sourceType as InboundImportSourceType | undefined,
      externalId,
      payloadMetadata: payloadMetadata as Prisma.InputJsonValue | undefined,
      destinationType: destinationType as InboundImportDestinationType | undefined,
      destinationId
    });

    return res.status(201).json(created);
  } catch (error: any) {
    logger.error('Erro ao criar importação técnica:', error);

    if (error.message?.includes('já registrada')) {
      return res.status(409).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao criar importação técnica.' });
  }
}

export async function listInboundImports(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      sourceType,
      destinationType,
      processed,
      search,
      page,
      pageSize
    } = req.body;

    const result = await InboundImportService.listInboundImports({
      companyId,
      sourceType: sourceType as InboundImportSourceType | undefined,
      destinationType: destinationType as InboundImportDestinationType | undefined,
      processed: processed === 'true' ? true : processed === 'false' ? false : undefined,
      search,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Erro ao listar importações técnicas:', error);
    return res.status(500).json({ error: 'Erro ao listar importações técnicas.' });
  }
}

export async function updateInboundImportDestination(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const id = parseId(req.params.id);
    const { destinationType, destinationId } = req.body;

    const updated = await InboundImportService.updateDestination({
      id,
      companyId,
      destinationType: destinationType as InboundImportDestinationType,
      destinationId
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    logger.error('Erro ao atualizar destino de importação:', error);

    if (error.message?.includes('não encontrada')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message?.includes('ID inválido')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Erro ao atualizar destino de importação.' });
  }
}

