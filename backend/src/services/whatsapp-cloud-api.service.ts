import crypto from 'crypto';
import { INTEGRATIONS_CONFIG } from '../config';
import { assertAudioSize, audioFileType, MAX_WHATSAPP_AUDIO_BYTES, WhatsAppAudioError } from '../utils/whatsapp-audio';

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
export type WhatsAppReplyList = { button: string; rows: { id: string; title: string; description?: string }[] };

function normalizeDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export default class WhatsAppCloudApiService {
  static async downloadAudio(mediaId: string) {
    this.assertReady();
    if (!/^\d+$/.test(mediaId)) {
      throw new WhatsAppAudioError('invalid_media_id', 'Não consegui acessar o áudio. Envie uma nova mensagem de voz.');
    }
    const headers = { Authorization: `Bearer ${INTEGRATIONS_CONFIG.whatsappAccessToken}` };
    const endpoint = new URL(`https://graph.facebook.com/${INTEGRATIONS_CONFIG.whatsappApiVersion}/${mediaId}`);
    endpoint.searchParams.set('phone_number_id', INTEGRATIONS_CONFIG.whatsappPhoneNumberId);
    const metadataResponse = await fetch(endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!metadataResponse.ok) throw new Error(`whatsapp_media_metadata_${metadataResponse.status}`);
    const metadata = await metadataResponse.json() as { url?: string; mime_type?: string; file_size?: number; sha256?: string };
    assertAudioSize(metadata.file_size ?? 0);
    const fileType = audioFileType(metadata.mime_type || '');
    const url = new URL(metadata.url || '');
    // Only send the Meta credential to its media hosts, never an inbound URL or redirect.
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['fbsbx.com', 'fbcdn.net'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new Error('whatsapp_media_untrusted_url');
    }
    const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new Error(`whatsapp_media_download_${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      const length = response.headers.get('content-length');
      if (length) assertAudioSize(Number(length));
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_WHATSAPP_AUDIO_BYTES) assertAudioSize(bytes);
        chunks.push(part.value);
      }
      assertAudioSize(bytes);
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const buffer = Buffer.concat(chunks);
    if (metadata.sha256) {
      const encoding = /^[a-f0-9]{64}$/i.test(metadata.sha256) ? 'hex' : 'base64';
      const expected = Buffer.from(metadata.sha256, encoding);
      const actual = crypto.createHash('sha256').update(buffer).digest();
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        throw new Error('whatsapp_media_checksum_mismatch');
      }
    }
    return { buffer, ...fileType };
  }

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

  static async sendListMessage(params: SendTextMessageParams & { list: WhatsAppReplyList }): Promise<SendTextMessageResult> {
    const { list } = params;
    if (!params.text.trim() || params.text.length > 1024 || !list.button.trim() || list.button.length > 20 ||
        list.rows.length < 1 || list.rows.length > 10 || new Set(list.rows.map(row => row.id)).size !== list.rows.length ||
        list.rows.some(row => !row.id.trim() || row.id.length > 200 || !row.title.trim() || row.title.length > 24 ||
          (row.description?.length ?? 0) > 72)) throw new Error('Lista do WhatsApp fora dos limites permitidos.');
    const raw = await this.postMessage({ recipient_type: 'individual', to: normalizeDigits(params.to), type: 'interactive',
      ...(params.replyToMessageId ? { context: { message_id: params.replyToMessageId } } : {}),
      interactive: { type: 'list', body: { text: params.text }, action: { button: list.button, sections: [{ rows: list.rows }] } }
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
