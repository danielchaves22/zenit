import { Request, Response } from 'express';
import { INTEGRATIONS_CONFIG } from '../config';
import WhatsAppIntegrationService from '../services/whatsapp-integration.service';
import { logger } from '../utils/logger';

export async function verifyWhatsAppWebhook(req: Request, res: Response) {
  const mode = String(req.query['hub.mode'] || '');
  const verifyToken = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  if (
    mode === 'subscribe' &&
    verifyToken &&
    verifyToken === INTEGRATIONS_CONFIG.whatsappVerifyToken
  ) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Webhook do WhatsApp nao autorizado.' });
}

export async function receiveWhatsAppWebhook(req: Request, res: Response) {
  try {
    const signatureHeader = String(req.headers['x-hub-signature-256'] || '');
    const result = await WhatsAppIntegrationService.processWebhookPayload({
      payload: req.body || {},
      rawBody: req.rawBody,
      signatureHeader
    });

    return res.status(202).json(result);
  } catch (error: any) {
    logger.error('Erro no webhook WhatsApp:', error);

    const message = error?.message || 'Erro ao processar webhook WhatsApp.';
    if (message.includes('Assinatura')) {
      return res.status(401).json({ error: message });
    }

    return res.status(500).json({ error: message });
  }
}
