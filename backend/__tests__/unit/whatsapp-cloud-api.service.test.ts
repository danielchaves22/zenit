import WhatsAppCloudApiService from '../../src/services/whatsapp-cloud-api.service';

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

  it('keeps ordinary text replies and reports Meta rejection', async () => {
    await WhatsAppCloudApiService.sendTextMessage({ to: '5544999990000', text: 'Olá' });
    expect(JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({
      type: 'text', text: { preview_url: false, body: 'Olá' }
    });
    jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 100 } }) } as Response);
    await expect(WhatsAppCloudApiService.sendTypingIndicator('wamid.incoming')).rejects.toThrow('400');
  });
});
