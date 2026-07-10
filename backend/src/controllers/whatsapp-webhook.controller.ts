import { Request, Response } from 'express';
import { INTEGRATIONS_CONFIG } from '../config';
import WhatsAppIntegrationService from '../services/whatsapp-integration.service';
import { logger } from '../utils/logger';

function normalizeWebhookQueryValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : String(value[0] || '').trim();
  }

  return String(value || '').trim();
}

export async function verifyWhatsAppWebhook(req: Request, res: Response) {
  const rawMode = req.query['hub.mode'];
  const rawVerifyToken = req.query['hub.verify_token'];
  const rawChallenge = req.query['hub.challenge'];

  const mode = normalizeWebhookQueryValue(rawMode);
  const verifyToken = normalizeWebhookQueryValue(rawVerifyToken);
  const challenge = normalizeWebhookQueryValue(rawChallenge);
  const configuredVerifyToken = String(INTEGRATIONS_CONFIG.whatsappVerifyToken || '').trim();
  const verificationMatches = mode === 'subscribe' && verifyToken && verifyToken === configuredVerifyToken;

  if (verificationMatches) {
    logger.info(
      `WhatsApp webhook verification succeeded ${JSON.stringify({
        challengeLength: challenge.length,
        configuredVerifyTokenLength: configuredVerifyToken.length,
        hasVerifyToken: Boolean(verifyToken),
        mode,
        queryKeys: Object.keys(req.query || {}).sort(),
        requestId: req.id || null,
        verifyTokenLength: verifyToken.length
      })}`
    );

    return res.status(200).send(challenge);
  }

  logger.warn(
    `WhatsApp webhook verification failed ${JSON.stringify({
      challengeLength: challenge.length,
      configuredVerifyTokenLength: configuredVerifyToken.length,
      hasConfiguredVerifyToken: Boolean(configuredVerifyToken),
      hasVerifyToken: Boolean(verifyToken),
      mode,
      modeMatches: mode === 'subscribe',
      queryKeys: Object.keys(req.query || {}).sort(),
      requestId: req.id || null,
      verifyTokenLength: verifyToken.length,
      verifyTokenMatches: Boolean(verifyToken) && verifyToken === configuredVerifyToken
    })}`
  );

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
