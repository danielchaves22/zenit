jest.mock('../../src/services/openai-integration.service', () => ({ __esModule: true, default: { getDecryptedCredential: jest.fn() } }));
jest.mock('../../src/services/whatsapp-cloud-api.service', () => ({ __esModule: true, default: { downloadAudio: jest.fn() } }));
jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: { financialAccount: { findMany: jest.fn() } } }));
jest.mock('../../src/services/user-financial-account-access.service', () => ({ __esModule: true, default: { getUserAccessibleAccounts: jest.fn() } }));

import Audio from '../../src/services/whatsapp-audio.service';
import Credentials from '../../src/services/openai-integration.service';
import Cloud from '../../src/services/whatsapp-cloud-api.service';
import prisma from '../../src/lib/prisma';
import AccountAccess from '../../src/services/user-financial-account-access.service';

const context = { userId: 9, role: 'USER' as const };

describe('WhatsApp audio transcription', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(Credentials.getDecryptedCredential).mockResolvedValue({ apiKey: 'tenant-key' } as any);
    jest.mocked(AccountAccess.getUserAccessibleAccounts).mockResolvedValue([7]);
    jest.mocked(prisma.financialAccount.findMany).mockResolvedValue([{ name: 'Nubank Daniel' }] as any);
    jest.mocked(Cloud.downloadAudio).mockResolvedValue({ buffer: Buffer.from('voice'), mimeType: 'audio/ogg', filename: 'mensagem.ogg' });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: '  Na verdade foram 45 reais.  ' })));
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the active company credential and uploads a typed file with Portuguese transcription hints', async () => {
    const result = await Audio.transcribe({ ...context, companyId: 8, mediaId: '123' });
    expect(Credentials.getDecryptedCredential).toHaveBeenCalledWith(8);
    expect(Cloud.downloadAudio).toHaveBeenCalledWith('123');
    const [endpoint, request] = jest.mocked(fetch).mock.calls[0];
    expect(endpoint).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(request?.headers).toEqual({ Authorization: 'Bearer tenant-key' });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const form = request?.body as FormData;
    expect(form.get('model')).toBe('gpt-transcribe');
    expect(form.get('languages[]')).toBe('pt');
    expect(form.get('language')).toBeNull();
    expect(form.getAll('keywords[]')).toEqual(['Nubank Daniel']);
    expect(prisma.financialAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 8, id: { in: [7] }, isActive: true }, select: { name: true }
    }));
    const file = form.get('file') as File;
    expect(file.name).toBe('mensagem.ogg');
    expect(file.type).toBe('audio/ogg');
    expect(await file.text()).toBe('voice');
    expect(result.text).toBe('Na verdade foram 45 reais.');
    expect(result.telemetry).toMatchObject({ model: 'gpt-transcribe', bytes: 5 });
    expect(JSON.stringify(result.telemetry)).not.toContain('45 reais');
  });

  it.each(['', '   ', null, 123])('rejects missing or empty speech: %s', async (text) => {
    jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ text })));
    await expect(Audio.transcribe({ ...context, companyId: 8, mediaId: '123' })).rejects.toMatchObject({ code: 'empty_transcription' });
  });

  it('does not download audio when the company credential is disabled', async () => {
    jest.mocked(Credentials.getDecryptedCredential).mockRejectedValueOnce(new Error('disabled'));
    await expect(Audio.transcribe({ ...context, companyId: 8, mediaId: '123' })).rejects.toThrow('disabled');
    expect(Cloud.downloadAudio).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not expose provider response bodies on failure', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(new Response('private transcript and key', { status: 429 }));
    await expect(Audio.transcribe({ ...context, companyId: 8, mediaId: '123' })).rejects.toThrow('whatsapp_transcription_429');
  });

  it('rejects an oversized transcript instead of silently truncating financial instructions', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ text: 'a'.repeat(6001) })));
    await expect(Audio.transcribe({ ...context, companyId: 8, mediaId: '123' })).rejects.toMatchObject({ code: 'transcription_too_long' });
  });

  it('keeps the vocabulary empty for a user with no permitted accounts', async () => {
    jest.mocked(AccountAccess.getUserAccessibleAccounts).mockResolvedValueOnce([]);
    jest.mocked(prisma.financialAccount.findMany).mockResolvedValueOnce([]);
    await Audio.transcribe({ ...context, companyId: 8, mediaId: '123' });
    expect(prisma.financialAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      companyId: 8, isActive: true, id: { in: [] }
    } }));
    expect((jest.mocked(fetch).mock.calls[0][1]?.body as FormData).getAll('keywords[]')).toEqual([]);
  });
});
