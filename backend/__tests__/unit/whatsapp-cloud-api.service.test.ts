import WhatsAppCloudApiService from '../../src/services/whatsapp-cloud-api.service';
import crypto from 'crypto';
import { MAX_WHATSAPP_AUDIO_BYTES } from '../../src/utils/whatsapp-audio';

describe('WhatsApp Cloud API feedback', () => {
  beforeEach(() => {
    jest.spyOn(WhatsAppCloudApiService, 'assertReady').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ messages: [{ id: 'wamid.sent' }] })
    } as Response);
  });
  afterEach(() => jest.restoreAllMocks());

  it('marks the inbound message read and requests the native typing indicator', async () => {
    await WhatsAppCloudApiService.sendTypingIndicator('wamid.incoming');
    const request = jest.mocked(fetch).mock.calls[0][1]!;
    expect(JSON.parse(request.body as string)).toEqual({
      messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.incoming',
      typing_indicator: { type: 'text' }
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends native reply buttons with the original message context', async () => {
    const buttons = [{ id: 'zenit:confirm:1:1000', title: 'Confirmar' }, { id: 'zenit:cancel:1:1000', title: 'Cancelar' }];
    const sent = await WhatsAppCloudApiService.sendReplyButtons({
      to: '+55 (44) 99999-0000', text: 'Confirma?', replyToMessageId: 'wamid.incoming', buttons
    });
    expect(sent.messageId).toBe('wamid.sent');
    expect(JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '5544999990000',
      type: 'interactive', context: { message_id: 'wamid.incoming' },
      interactive: { type: 'button', body: { text: 'Confirma?' }, action: {
        buttons: buttons.map((reply) => ({ type: 'reply', reply }))
      } }
    });
  });

  it('rejects an oversized interactive body before calling Meta', async () => {
    await expect(WhatsAppCloudApiService.sendReplyButtons({
      to: '5544999990000', text: 'a'.repeat(1025), buttons: [{ id: '1', title: 'Confirmar' }]
    })).rejects.toThrow('limites');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends a single-choice list and refuses duplicate or oversized choices before calling Meta', async () => {
    const list = { button: 'Escolher categoria', rows: [{ id: 'zenit:category:1:1000:8', title: 'Restaurante' }] };
    await WhatsAppCloudApiService.sendListMessage({ to: '5544999990000', text: 'Escolha', list });
    expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body)).interactive).toEqual({
      type: 'list', body: { text: 'Escolha' }, action: { button: list.button, sections: [{ rows: list.rows }] }
    });
    for (const rows of [[], [list.rows[0], list.rows[0]], [{ id: '1', title: 'x'.repeat(25) }], Array(11).fill(list.rows[0])]) {
      await expect(WhatsAppCloudApiService.sendListMessage({ to: '5544999990000', text: 'Escolha', list: { ...list, rows } })).rejects.toThrow('limites');
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary text replies and reports Meta rejection', async () => {
    await WhatsAppCloudApiService.sendTextMessage({ to: '5544999990000', text: 'Olá' });
    expect(JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({
      type: 'text', text: { preview_url: false, body: 'Olá' }
    });
    jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 100 } }) } as Response);
    await expect(WhatsAppCloudApiService.sendTypingIndicator('wamid.incoming')).rejects.toThrow('400');
  });
});

describe('WhatsApp audio download boundary', () => {
  const voice = Buffer.from('ogg voice fixture');
  const metadata = {
    url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123',
    mime_type: 'audio/ogg; codecs=opus', file_size: voice.length,
    sha256: crypto.createHash('sha256').update(voice).digest('hex')
  };
  beforeEach(() => {
    jest.spyOn(WhatsAppCloudApiService, 'assertReady').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(metadata)))
      .mockResolvedValueOnce(new Response(voice));
  });
  afterEach(() => jest.restoreAllMocks());

  it('retrieves only media belonging to the configured phone and downloads authenticated OGG/Opus', async () => {
    const downloaded = await WhatsAppCloudApiService.downloadAudio('123');
    expect(downloaded).toEqual({ buffer: voice, mimeType: 'audio/ogg', filename: 'mensagem.ogg' });
    const [url, options] = jest.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/graph.facebook.com\/v[\d.]+\/123\?phone_number_id=/);
    expect(options?.redirect).toBe('error');
    expect(jest.mocked(fetch).mock.calls[1][1]?.headers).toEqual(options?.headers);
  });

  it.each(['https://evil.test/audio', 'http://lookaside.fbsbx.com/audio', 'https://lookaside.fbsbx.com.evil.test/a'])('does not forward credentials to %s', async (url) => {
    jest.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ ...metadata, url })));
    await expect(WhatsAppCloudApiService.downloadAudio('123')).rejects.toThrow('untrusted_url');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed media IDs without contacting Meta', async () => {
    await expect(WhatsAppCloudApiService.downloadAudio('../messages')).rejects.toMatchObject({ code: 'invalid_media_id' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([0, MAX_WHATSAPP_AUDIO_BYTES + 1])('rejects media size %s before downloading', async (file_size) => {
    jest.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ ...metadata, file_size })));
    await expect(WhatsAppCloudApiService.downloadAudio('123')).rejects.toMatchObject({ code: 'invalid_audio_size' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops a streaming download exceeding the limit even if metadata reports a small file', async () => {
    jest.mocked(fetch).mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(metadata)))
      .mockResolvedValueOnce(new Response(new Uint8Array(MAX_WHATSAPP_AUDIO_BYTES + 1)));
    await expect(WhatsAppCloudApiService.downloadAudio('123')).rejects.toMatchObject({ code: 'invalid_audio_size' });
  });

  it('rejects corrupted audio', async () => {
    jest.mocked(fetch).mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(metadata)))
      .mockResolvedValueOnce(new Response('different file'));
    await expect(WhatsAppCloudApiService.downloadAudio('123')).rejects.toThrow('checksum_mismatch');
  });

  it('rejects unsupported files before transcription', async () => {
    jest.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ ...metadata, mime_type: 'application/pdf' })));
    await expect(WhatsAppCloudApiService.downloadAudio('123')).rejects.toMatchObject({ code: 'unsupported_audio' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
