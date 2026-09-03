import { Request, Response } from 'express';
import SystemOperationsService from '../services/system-operations.service';
import { logger } from '../utils/logger';

function ensureOperationsAccess(req: Request) {
  const role = req.user?.role;

  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    throw new Error('Acesso negado: apenas administradores podem visualizar operacoes do sistema.');
  }
}

export async function getSystemOperationsOverview(req: Request, res: Response) {
  try {
    ensureOperationsAccess(req);

    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Empresa nao informada' });
    }

    const overview = await SystemOperationsService.getOverview(companyId);
    return res.status(200).json(overview);
  } catch (error: any) {
    logger.error('Erro ao consultar operacoes do sistema', {
      error: error?.message ?? String(error),
      stack: error?.stack
    });

    return res.status(error.message?.includes('Acesso negado') ? 403 : 500).json({
      error: error.message || 'Erro ao consultar operacoes do sistema'
    });
  }
}
