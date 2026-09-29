import OpenAiIntegrationService from './openai-integration.service';
import WhatsAppCloudApiService from './whatsapp-cloud-api.service';
import { WhatsAppAudioError } from '../utils/whatsapp-audio';
import { Role } from '@prisma/client';
import prisma from '../lib/prisma';
import AccountAccess from './user-financial-account-access.service';

export default class WhatsAppAudioService {
  static async transcribe(params: { companyId: number; userId: number; role: Role; mediaId: string }) {
    const startedAt = Date.now();
    const credential = await OpenAiIntegrationService.getDecryptedCredential(params.companyId);
    const accountIds = await AccountAccess.getUserAccessibleAccounts(params.userId, params.role, params.companyId);
    const accounts = await prisma.financialAccount.findMany({
      where: { companyId: params.companyId, id: { in: accountIds }, isActive: true },
      select: { name: true }, orderBy: { name: 'asc' }, take: 20
    });
    const vocabulary = accounts.map(account => account.name.replace(/[<>\r\n]/g, ' ').trim().slice(0, 80)).filter(Boolean);
    const audio = await WhatsAppCloudApiService.downloadAudio(params.mediaId);
    const model = process.env.WHATSAPP_TRANSCRIPTION_MODEL?.trim() || 'gpt-transcribe';
    const form = new FormData();
    form.append('model', model);
    form.append('file', new Blob([new Uint8Array(audio.buffer)], { type: audio.mimeType }), audio.filename);
    form.append(model.startsWith('gpt-transcribe') ? 'languages[]' : 'language', 'pt');
    const prompt = 'Mensagem em português brasileiro sobre finanças pessoais, despesas e correções de lançamentos. Preserve os valores e transcreva somente o que foi falado.';
    if (model.startsWith('gpt-transcribe')) {
      form.append('prompt', prompt);
      for (const word of vocabulary) form.append('keywords[]', word);
    } else {
      form.append('prompt', `${prompt} Vocabulário de contas: ${vocabulary.join(', ')}.`);
    }
    form.append('response_format', 'json');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60000)
    });
    // Provider responses can contain private data; only expose a status code on failure.
    if (!response.ok) throw new Error(`whatsapp_transcription_${response.status}`);
    const result = await response.json() as { text?: unknown };
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    if (!text) {
      throw new WhatsAppAudioError('empty_transcription',
        'Não consegui entender uma fala neste áudio. Grave novamente com mais clareza ou envie o pedido por texto.');
    }
    if (text.length > 6000) {
      throw new WhatsAppAudioError('transcription_too_long',
        'Este áudio ficou longo demais para um único pedido. Envie uma mensagem mais curta.');
    }
    return { text, telemetry: { model, bytes: audio.buffer.length, latencyMs: Date.now() - startedAt } };
  }
}
