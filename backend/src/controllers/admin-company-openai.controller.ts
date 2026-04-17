import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import OpenAiIntegrationService from '../services/openai-integration.service';
import { logAuditEvent } from '../utils/audit-logger';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

function getActorContext(req: Request): { actorUserId: number; actorRole: string; actorCompanyId: number } {
  // @ts-ignore - populated by middlewares
  const { userId, role, companyId } = req.user;

  if (!userId || !role || !companyId) {
    throw new Error('Contexto de usuario invalido.');
  }

  return {
    actorUserId: userId,
    actorRole: role,
    actorCompanyId: companyId
  };
}

function parseTargetCompanyId(req: Request): number {
  const targetCompanyId = Number(req.params.companyId);

  if (!Number.isInteger(targetCompanyId) || targetCompanyId <= 0) {
    throw new Error('companyId invalido.');
  }

  return targetCompanyId;
}

async function ensureTargetCompanyExists(targetCompanyId: number): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: targetCompanyId },
    select: { id: true }
  });

  if (!company) {
    throw new Error('Empresa alvo nao encontrada.');
  }
}

function ensureAdminRole(actorRole: string): void {
  if (actorRole !== 'ADMIN') {
    throw new Error('Acesso negado: apenas ADMIN pode gerenciar OpenAI por empresa.');
  }
}

export async function getAdminCompanyOpenAiStatus(req: Request, res: Response) {
  try {
    const { actorRole, actorUserId, actorCompanyId } = getActorContext(req);
    ensureAdminRole(actorRole);

    const targetCompanyId = parseTargetCompanyId(req);
    await ensureTargetCompanyExists(targetCompanyId);

    const status = await OpenAiIntegrationService.getAdminStatus(targetCompanyId);

    logAuditEvent('openai.admin_status_viewed', {
      actorUserId,
      actorCompanyId,
      targetCompanyId
    });

    return res.status(200).json(status);
  } catch (error: any) {
    if (String(error.message || '').includes('Acesso negado')) {
      return res.status(403).json({ error: error.message });
    }
    if (String(error.message || '').includes('Empresa alvo nao encontrada')) {
      return res.status(404).json({ error: error.message });
    }
    if (String(error.message || '').includes('companyId invalido')) {
      return res.status(400).json({ error: error.message });
    }

    logger.error('Erro ao consultar status OpenAI administrativo:', error);
    return res.status(500).json({ error: 'Erro ao consultar status OpenAI administrativo.' });
  }
}

export async function upsertAdminCompanyOpenAi(req: Request, res: Response) {
  try {
    const { actorRole, actorUserId, actorCompanyId } = getActorContext(req);
    ensureAdminRole(actorRole);

    const targetCompanyId = parseTargetCompanyId(req);
    await ensureTargetCompanyExists(targetCompanyId);

    const { apiKey, model, promptVersion, isActive } = req.body;

    const saved = await OpenAiIntegrationService.upsertByok({
      companyId: targetCompanyId,
      apiKey,
      model,
      promptVersion,
      isActive
    });

    logAuditEvent('openai.admin_updated', {
      actorUserId,
      actorCompanyId,
      targetCompanyId,
      model: saved.model,
      promptVersion: saved.promptVersion,
      isActive: saved.isActive
    });

    return res.status(200).json(saved);
  } catch (error: any) {
    if (String(error.message || '').includes('Acesso negado')) {
      return res.status(403).json({ error: error.message });
    }
    if (String(error.message || '').includes('Empresa alvo nao encontrada')) {
      return res.status(404).json({ error: error.message });
    }
    if (String(error.message || '').includes('companyId invalido')) {
      return res.status(400).json({ error: error.message });
    }

    logger.error('Erro ao salvar OpenAI administrativo por empresa:', error);
    return res.status(400).json({ error: error.message || 'Erro ao salvar configuracao OpenAI.' });
  }
}

export async function testAdminCompanyOpenAi(req: Request, res: Response) {
  try {
    const { actorRole, actorUserId, actorCompanyId } = getActorContext(req);
    ensureAdminRole(actorRole);

    const targetCompanyId = parseTargetCompanyId(req);
    await ensureTargetCompanyExists(targetCompanyId);

    const { apiKey, model } = req.body;
    const result = await OpenAiIntegrationService.testCredential({
      companyId: targetCompanyId,
      apiKey,
      model
    });

    logAuditEvent('openai.admin_tested', {
      actorUserId,
      actorCompanyId,
      targetCompanyId,
      ok: result.ok,
      status: result.status
    });

    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error: any) {
    if (String(error.message || '').includes('Acesso negado')) {
      return res.status(403).json({ error: error.message });
    }
    if (String(error.message || '').includes('Empresa alvo nao encontrada')) {
      return res.status(404).json({ error: error.message });
    }
    if (String(error.message || '').includes('companyId invalido')) {
      return res.status(400).json({ error: error.message });
    }

    logger.error('Erro ao testar OpenAI administrativo por empresa:', error);
    return res.status(400).json({ error: error.message || 'Erro ao testar OpenAI.' });
  }
}
