import { Request, Response } from 'express';
import GmailIntegrationService from '../services/gmail-integration.service';
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

function isStrictSuperuser(role: string): boolean {
  return role === 'SUPERUSER';
}

function getSettingsRedirectBaseUrl(base: string): string {
  return `${base.replace(/\/$/, '')}/settings?tab=company`;
}

export async function getGmailIntegrationStatus(req: Request, res: Response) {
  try {
    const { companyId, role } = getCompanyContext(req);

    if (!isStrictSuperuser(role)) {
      return res.status(403).json({ error: 'Acesso negado: apenas SUPERUSER pode visualizar integracoes da empresa.' });
    }

    const status = await GmailIntegrationService.getStatus(companyId);
    return res.status(200).json(status);
  } catch (error: any) {
    logger.error('Erro ao consultar status da integracao Gmail:', error);
    return res.status(500).json({ error: 'Erro ao consultar status da integracao Gmail.' });
  }
}

export async function startGmailOAuth(req: Request, res: Response) {
  try {
    const { companyId, role, userId } = getCompanyContext(req);

    if (!isStrictSuperuser(role)) {
      return res.status(403).json({ error: 'Acesso negado: apenas SUPERUSER pode configurar integracoes da empresa.' });
    }

    const result = GmailIntegrationService.createOAuthStartUrl(companyId);

    logAuditEvent('gmail.oauth_start_requested', {
      companyId,
      userId,
      role
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao iniciar OAuth Gmail:', error);
    return res.status(400).json({ error: error.message || 'Erro ao iniciar OAuth Gmail.' });
  }
}

export async function gmailOAuthCallback(req: Request, res: Response) {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');

  const redirectBase = GmailIntegrationService.getCallbackRedirectBase();

  if (!code || !state) {
    if (redirectBase) {
      const settingsPath = getSettingsRedirectBaseUrl(redirectBase);
      return res.redirect(`${settingsPath}&gmail=error&reason=missing_code_or_state`);
    }
    return res.status(400).json({ error: 'code/state sao obrigatorios no callback.' });
  }

  try {
    const result = await GmailIntegrationService.handleOAuthCallback(code, state);

    logAuditEvent('gmail.oauth_connected', {
      companyId: result.companyId,
      connectionId: result.connectionId,
      googleEmail: result.googleEmail
    });

    if (redirectBase) {
      const settingsPath = getSettingsRedirectBaseUrl(redirectBase);
      return res.redirect(`${settingsPath}&gmail=connected`);
    }

    return res.status(200).json({ ok: true, message: 'Conexao Gmail concluida.' });
  } catch (error: any) {
    logger.error('Erro no callback OAuth Gmail:', error);

    if (redirectBase) {
      const reason = encodeURIComponent(error.message || 'oauth_callback_error');
      const settingsPath = getSettingsRedirectBaseUrl(redirectBase);
      return res.redirect(`${settingsPath}&gmail=error&reason=${reason}`);
    }

    return res.status(400).json({ error: error.message || 'Erro no callback OAuth Gmail.' });
  }
}

export async function updateGmailIngestionConfig(req: Request, res: Response) {
  try {
    const { companyId, role, userId } = getCompanyContext(req);

    if (!isStrictSuperuser(role)) {
      return res.status(403).json({ error: 'Acesso negado: apenas SUPERUSER pode configurar integracoes da empresa.' });
    }

    const updated = await GmailIntegrationService.updateConfig(companyId, req.body);

    logAuditEvent('gmail.config_updated', {
      companyId,
      userId,
      role,
      enabled: updated.enabled,
      lookbackDays: updated.lookbackDays,
      pollingIntervalMinutes: updated.pollingIntervalMinutes,
      reconciliationIntervalMinutes: updated.reconciliationIntervalMinutes,
      maxEmailsPerRun: updated.maxEmailsPerRun
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    logger.error('Erro ao atualizar configuracao de ingestao Gmail:', error);
    return res.status(400).json({ error: error.message || 'Erro ao atualizar configuracao Gmail.' });
  }
}

export async function disconnectGmail(req: Request, res: Response) {
  try {
    const { companyId, role, userId } = getCompanyContext(req);

    if (!isStrictSuperuser(role)) {
      return res.status(403).json({ error: 'Acesso negado: apenas SUPERUSER pode configurar integracoes da empresa.' });
    }

    const disconnected = await GmailIntegrationService.disconnect(companyId);

    logAuditEvent('gmail.disconnected', {
      companyId,
      userId,
      role,
      status: disconnected.status
    });

    return res.status(200).json(disconnected);
  } catch (error: any) {
    logger.error('Erro ao desconectar Gmail:', error);
    return res.status(400).json({ error: error.message || 'Erro ao desconectar Gmail.' });
  }
}

export async function syncGmailNow(req: Request, res: Response) {
  try {
    const { companyId, role, userId } = getCompanyContext(req);

    if (!isStrictSuperuser(role)) {
      return res.status(403).json({ error: 'Acesso negado: apenas SUPERUSER pode sincronizar integracoes da empresa.' });
    }

    const result = await GmailIntegrationService.syncNow(companyId);

    logAuditEvent('gmail.sync_manual_triggered', {
      companyId,
      userId,
      role,
      createdProcesses: 'createdProcesses' in result ? result.createdProcesses : 0,
      linkedImports: 'linkedImports' in result ? result.linkedImports : 0,
      alreadyLinked: 'alreadyLinked' in result ? result.alreadyLinked : 0,
      skipped: result.skipped,
      errors: 'errors' in result ? result.errors : 0
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao executar sync manual Gmail:', error);
    return res.status(400).json({ error: error.message || 'Erro ao executar sync manual Gmail.' });
  }
}
