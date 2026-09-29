jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: {
  companyAiCredential: { findUnique: jest.fn(), upsert: jest.fn() }
} }));
jest.mock('../../src/utils/secret-crypto', () => ({ encryptSecret: jest.fn(), decryptSecret: jest.fn() }));

import prisma from '../../src/lib/prisma';
import OpenAiIntegrationService from '../../src/services/openai-integration.service';
import { encryptSecret } from '../../src/utils/secret-crypto';

describe('OpenAI model-only updates', () => {
  beforeEach(() => jest.resetAllMocks());

  it('updates the model without requiring or replacing the existing API key', async () => {
    const existing = { apiKeyCiphertext: 'saved-ciphertext', apiKeyIv: 'saved-iv', apiKeyTag: 'saved-tag',
      model: 'gpt-5.4-nano', promptVersion: 'v3', isActive: true };
    jest.mocked(prisma.companyAiCredential.findUnique).mockResolvedValue(existing as any);
    jest.mocked(prisma.companyAiCredential.upsert).mockResolvedValue({ model: 'gpt-6-luna' } as any);
    await expect(OpenAiIntegrationService.upsertByok({ companyId: 2, model: 'gpt-6-luna' })).resolves.toMatchObject({ model: 'gpt-6-luna' });
    expect(encryptSecret).not.toHaveBeenCalled();
    expect(prisma.companyAiCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {
      apiKeyCiphertext: existing.apiKeyCiphertext, apiKeyIv: existing.apiKeyIv, apiKeyTag: existing.apiKeyTag,
      model: 'gpt-6-luna', promptVersion: 'v3', isActive: true
    } }));
  });

  it('still requires a key for first configuration', async () => {
    jest.mocked(prisma.companyAiCredential.findUnique).mockResolvedValue(null);
    await expect(OpenAiIntegrationService.upsertByok({ companyId: 2, model: 'gpt-6-luna' })).rejects.toThrow('apiKey');
    expect(prisma.companyAiCredential.upsert).not.toHaveBeenCalled();
  });

  it('encrypts the provided key on first configuration', async () => {
    jest.mocked(prisma.companyAiCredential.findUnique).mockResolvedValue(null);
    jest.mocked(encryptSecret).mockReturnValue({ ciphertext: 'new-ciphertext', iv: 'new-iv', tag: 'new-tag' });
    await OpenAiIntegrationService.upsertByok({ companyId: 2, apiKey: 'test-key-only', model: 'gpt-6-luna' });
    expect(prisma.companyAiCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({
      companyId: 2, model: 'gpt-6-luna', apiKeyCiphertext: 'new-ciphertext', apiKeyIv: 'new-iv', apiKeyTag: 'new-tag'
    }) }));
  });
});
