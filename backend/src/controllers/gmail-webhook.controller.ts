import { Request, Response } from 'express';
import { INTEGRATIONS_CONFIG } from '../config';
import { PrismaClient } from '@prisma/client';
import EmailIngestionService from '../services/email-ingestion.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

function parsePubSubData(data: string | undefined): any {
  if (!data) return null;
  try {
    const decoded = Buffer.from(data, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export async function gmailWebhook(req: Request, res: Response) {
  try {
    const expectedSecret = INTEGRATIONS_CONFIG.gmailWebhookSecret;

    if (expectedSecret) {
      const incoming = String(req.headers['x-webhook-secret'] || '');
      if (!incoming || incoming !== expectedSecret) {
        return res.status(401).json({ error: 'Webhook nao autorizado.' });
      }
    }

    const body = req.body || {};
    const pubsub = body.message || {};
    const decoded = parsePubSubData(pubsub.data);

    const emailAddress = decoded?.emailAddress;

    if (!emailAddress) {
      return res.status(202).json({ accepted: true, skipped: 'missing-emailAddress' });
    }

    const connection = await prisma.gmailConnection.findFirst({
      where: {
        googleEmail: emailAddress,
        status: 'ACTIVE',
        disabledAt: null
      },
      select: { companyId: true, id: true }
    });

    if (!connection) {
      return res.status(202).json({ accepted: true, skipped: 'connection-not-found' });
    }

    const summary = await EmailIngestionService.syncCompany(connection.companyId, 'push');

    return res.status(202).json({ accepted: true, companyId: connection.companyId, summary });
  } catch (error: any) {
    logger.error('Erro no webhook Gmail:', error);
    return res.status(500).json({ error: 'Erro ao processar webhook Gmail.' });
  }
}

