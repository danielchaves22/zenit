import { Request, Response } from 'express';
import OpenAiIntegrationService from '../services/openai-integration.service';
import { logAuditEvent } from '../utils/audit-logger';
import { logger } from '../utils/logger';

function getCompanyContext(req: Request): { companyId: number; role: string; userId: number } {
  // @ts-ignore - populated by middlewares
  const { companyId, role, userId } = req.user;

  if (!companyId || !role || !userId) {
    throw new Error('Contexto de empresa invalido.');
  }

  return { companyId, role, userId };
}

export async function getOpenAiIntegrationStatus(req: Request, res: Response) {
  try {
    const { companyId } = getCompanyContext(req);
    const status = await OpenAiIntegrationService.getTenantStatus(companyId);
    return res.status(200).json(status);
  } catch (error: any) {
    logger.error('Erro ao consultar status da integracao OpenAI:', error);
    return res.status(500).json({ error: 'Erro ao consultar status da integracao OpenAI.' });
  }
}

export async function upsertOpenAiByok(req: Request, res: Response) {
  try {
    const { companyId, role, userId } = getCompanyContext(req);

    logAuditEvent('openai.tenant_write_denied', {
      companyId,
      userId,
      role,
      endpoint: 'PUT /api/integrations/openai/byok'
    });

    return res.status(403).json({
      error: 'Configuracao OpenAI e gerenciada no painel administrativo da plataforma.'
    });
  } catch (error: any) {
    logger.error('Erro ao aplicar politica de escrita OpenAI no tenant:', error);
    return res.status(500).json({ error: 'Erro ao aplicar politica de OpenAI no tenant.' });
  }
}

export async function testOpenAiCredential(req: Request, res: Response) {
  try {
    const { companyId, role, userId } = getCompanyContext(req);

    logAuditEvent('openai.tenant_test_denied', {
      companyId,
      userId,
      role,
      endpoint: 'POST /api/integrations/openai/test'
    });

    return res.status(403).json({
      error: 'Teste OpenAI e gerenciado no painel administrativo da plataforma.'
    });
  } catch (error: any) {
    logger.error('Erro ao aplicar politica de teste OpenAI no tenant:', error);
    return res.status(500).json({ error: 'Erro ao aplicar politica de OpenAI no tenant.' });
  }
}
