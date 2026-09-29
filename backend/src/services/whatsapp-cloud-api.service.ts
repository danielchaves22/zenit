import crypto from 'crypto';
import { INTEGRATIONS_CONFIG } from '../config';

type SendTextMessageParams = {
  replyToMessageId?: string | null;
  text: string;
  to: string;
};

type SendTextMessageResult = {
  messageId: string | null;
  raw: Record<string, unknown>;
};

export type WhatsAppReplyButton = { id: string; title: string };

function normalizeDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export default class WhatsAppCloudApiService {
  static getConfigurationStatus() {
    const cloudApiConfigured = Boolean(
      INTEGRATIONS_CONFIG.whatsappAccessToken && INTEGRATIONS_CONFIG.whatsappPhoneNumberId
    );
    const webhookVerificationConfigured = Boolean(INTEGRATIONS_CONFIG.whatsappVerifyToken);
    const signatureValidationConfigured = Boolean(INTEGRATIONS_CONFIG.whatsappAppSecret);
    const deepLinkConfigured = Boolean(
      normalizeDigits(INTEGRATIONS_CONFIG.whatsappBusinessPhoneE164)
    );

    return {
      cloudApiConfigured,
      webhookVerificationConfigured,
      signatureValidationConfigured,
      deepLinkConfigured,
      ready:
        cloudApiConfigured &&
        webhookVerificationConfigured &&
        signatureValidationConfigured &&
        deepLinkConfigured
    };
  }

  static assertReady() {
    const status = this.getConfigurationStatus();
    if (!status.ready) {
      throw new Error('Configuracao do WhatsApp Cloud API incompleta no backend.');
    }
  }

  static getBindingPrefillMessage(code: string) {
    const prefix = INTEGRATIONS_CONFIG.whatsappBindingMessagePrefix.trim();
    return `${prefix} ${code}`.trim();
  }

  static buildDeepLink(prefilledMessage: string): string | null {
    const businessPhone = normalizeDigits(INTEGRATIONS_CONFIG.whatsappBusinessPhoneE164);
    if (!businessPhone) {
      return null;
    }

    return `https://wa.me/${businessPhone}?text=${encodeURIComponent(prefilledMessage)}`;
  }

  static verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined | null) {
    const appSecret = INTEGRATIONS_CONFIG.whatsappAppSecret;
    if (!appSecret) {
      return true;
    }

    if (!rawBody || !signatureHeader) {
      return false;
    }

    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const received = String(signatureHeader);

    if (expected.length !== received.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }

  private static async postMessage(payload: Record<string, unknown>, timeoutMs = 30000) {
    this.assertReady();

    const endpoint = `https://graph.facebook.com/${INTEGRATIONS_CONFIG.whatsappApiVersion}/${INTEGRATIONS_CONFIG.whatsappPhoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${INTEGRATIONS_CONFIG.whatsappAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        `Falha ao enviar mensagem WhatsApp: ${response.status} ${JSON.stringify(raw)}`
      );
    }

    return raw;
  }

  static async sendTypingIndicator(messageId: string): Promise<void> {
    await this.postMessage({
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' }
    }, 3000);
  }

  static async sendTextMessage(params: SendTextMessageParams): Promise<SendTextMessageResult> {
    const raw = await this.postMessage({
      recipient_type: 'individual',
      to: normalizeDigits(params.to),
      type: 'text',
      ...(params.replyToMessageId ? { context: { message_id: params.replyToMessageId } } : {}),
      text: { preview_url: false, body: params.text }
    });
    return this.messageResult(raw);
  }

  static async sendReplyButtons(params: SendTextMessageParams & {
    buttons: WhatsAppReplyButton[];
  }): Promise<SendTextMessageResult> {
    if (!params.text.trim() || params.text.length > 1024 ||
        params.buttons.length < 1 || params.buttons.length > 3 ||
        new Set(params.buttons.map((button) => button.id)).size !== params.buttons.length ||
        params.buttons.some((button) => !button.id || button.id.length > 256 ||
          !button.title.trim() || button.title.length > 20)) {
      throw new Error('Mensagem interativa do WhatsApp fora dos limites permitidos.');
    }
    const raw = await this.postMessage({
      recipient_type: 'individual',
      to: normalizeDigits(params.to),
      type: 'interactive',
      ...(params.replyToMessageId ? { context: { message_id: params.replyToMessageId } } : {}),
      interactive: {
        type: 'button',
        body: { text: params.text },
        action: {
          buttons: params.buttons.map((reply) => ({ type: 'reply', reply }))
        }
      }
    });
    return this.messageResult(raw);
  }

  private static messageResult(raw: Record<string, unknown>): SendTextMessageResult {
    const messages = Array.isArray(raw.messages) ? raw.messages : [];
    const firstMessage = messages[0] as { id?: string } | undefined;

    return {
      messageId: firstMessage?.id || null,
      raw
    };
  }
}
