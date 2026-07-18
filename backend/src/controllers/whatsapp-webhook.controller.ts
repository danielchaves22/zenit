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

function summarizeWebhookPayload(payload: Record<string, any>) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const changeCount = entries.reduce((total, entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return total + changes.length;
  }, 0);
  const fields = entries.flatMap((entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return changes
      .map((change: any) => String(change?.field || '').trim())
      .filter(Boolean);
  });

  return {
    changeCount,
    entryCount: entries.length,
    fields: Array.from(new Set(fields)).sort(),
    object: typeof payload?.object === 'string' ? payload.object : null
  };
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
    const payloadSummary = summarizeWebhookPayload(req.body || {});

    logger.info(
      `WhatsApp webhook POST received ${JSON.stringify({
        ...payloadSummary,
        hasRawBody: Boolean(req.rawBody),
        hasSignatureHeader: Boolean(signatureHeader),
        rawBodyLength: req.rawBody?.length ?? 0,
        requestId: req.id || null
      })}`
    );

    const result = await WhatsAppIntegrationService.processWebhookPayload({
      payload: req.body || {},
      rawBody: req.rawBody,
      signatureHeader
    });

    logger.info(
      `WhatsApp webhook POST processed ${JSON.stringify({
        ...payloadSummary,
        requestId: req.id || null,
        result
      })}`
    );

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
