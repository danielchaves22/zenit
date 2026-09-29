export const MAX_WHATSAPP_AUDIO_BYTES = 16 * 1024 * 1024;

const extensions: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac'
};

export class WhatsAppAudioError extends Error {
  constructor(readonly code: string, readonly userMessage: string) {
    super(code);
    this.name = 'WhatsAppAudioError';
  }
}

export function audioFileType(mimeType: string) {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  const extension = extensions[type];
  if (!extension) {
    throw new WhatsAppAudioError('unsupported_audio',
      'Não consigo ler este formato de áudio. Grave uma mensagem de voz pelo microfone do WhatsApp ou envie o pedido por texto.');
  }
  return { mimeType: type, filename: `mensagem.${extension}` };
}

export function assertAudioSize(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_WHATSAPP_AUDIO_BYTES) {
    throw new WhatsAppAudioError('invalid_audio_size',
      'O áudio está vazio ou ultrapassa 16 MB. Envie um áudio menor ou escreva o pedido.');
  }
}
