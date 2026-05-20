import { Request, Response } from 'express';
import { AppKey } from '@prisma/client';
import PersonalWorkspaceService from '../services/personal-workspace.service';
import { APP_HEADER, toPrismaAppKey } from '../constants/app-access';
import { logger } from '../utils/logger';

export async function getPersonalWorkspace(req: Request, res: Response) {
  try {
    const rawHeader = req.headers[APP_HEADER];
    const appHeaderValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const requestedApp = toPrismaAppKey(appHeaderValue);

    if (requestedApp !== AppKey.ZENIT_CASH) {
      return res.status(400).json({
        error: 'Cabecalho X-App-Key deve ser zenit-cash para esta operacao.'
      });
    }

    const userId = req.user.userId;
    const rawDeviceTimeZone = req.headers['x-device-timezone'];
    const deviceTimeZone = Array.isArray(rawDeviceTimeZone)
      ? rawDeviceTimeZone[0]
      : rawDeviceTimeZone;
    const workspace = await PersonalWorkspaceService.getOrCreateForUser(
      userId,
      deviceTimeZone
    );

    return res.status(200).json({
      companyId: workspace.companyId,
      name: workspace.name,
      created: workspace.created,
      timeZone: workspace.timeZone
    });
  } catch (error) {
    logger.error('Error resolving personal workspace', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.userId
    });

    return res.status(500).json({
      error: 'Erro ao resolver workspace pessoal'
    });
  }
}
