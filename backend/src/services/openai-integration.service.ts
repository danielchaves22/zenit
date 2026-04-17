import { AiProvider, PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../utils/secret-crypto';

const prisma = new PrismaClient();

type OpenAiCredentialSummary = {
  id: number;
  provider: AiProvider;
  model: string;
  promptVersion: string;
  isActive: boolean;
  updatedAt: Date;
  createdAt: Date;
};

export type OpenAiCredentialDecrypted = {
  companyId: number;
  provider: AiProvider;
  apiKey: string;
  model: string;
  promptVersion: string;
  isActive: boolean;
  updatedAt: Date;
};

export type OpenAiTenantStatus = {
  configured: boolean;
  model: string | null;
  promptVersion: string | null;
  isActive: boolean | null;
  updatedAt: Date | null;
  managedBy: 'PLATFORM_ADMIN';
};

export type OpenAiAdminStatus = {
  configured: boolean;
  credential: OpenAiCredentialSummary | null;
};

export default class OpenAiIntegrationService {
  static async upsertByok(data: {
    companyId: number;
    apiKey?: string;
    model?: string;
    promptVersion?: string;
    isActive?: boolean;
  }) {
    const existing = await prisma.companyAiCredential.findUnique({
      where: {
        unique_ai_credential_per_company_provider: {
          companyId: data.companyId,
          provider: 'OPENAI'
        }
      }
    });

    const normalizedApiKey = data.apiKey?.trim() || '';
    const encrypted = normalizedApiKey ? encryptSecret(normalizedApiKey) : null;

    if (!existing && !encrypted) {
      throw new Error('apiKey e obrigatoria para primeira configuracao.');
    }

    return prisma.companyAiCredential.upsert({
      where: {
        unique_ai_credential_per_company_provider: {
          companyId: data.companyId,
          provider: 'OPENAI'
        }
      },
      update: {
        apiKeyCiphertext: encrypted?.ciphertext ?? existing!.apiKeyCiphertext,
        apiKeyIv: encrypted?.iv ?? existing!.apiKeyIv,
        apiKeyTag: encrypted?.tag ?? existing!.apiKeyTag,
        model: (data.model || existing?.model || 'gpt-4o-mini').trim(),
        promptVersion: (data.promptVersion || existing?.promptVersion || 'v1').trim(),
        isActive: data.isActive ?? existing?.isActive ?? true
      },
      create: {
        companyId: data.companyId,
        provider: 'OPENAI',
        apiKeyCiphertext: encrypted!.ciphertext,
        apiKeyIv: encrypted!.iv,
        apiKeyTag: encrypted!.tag,
        model: (data.model || 'gpt-4o-mini').trim(),
        promptVersion: (data.promptVersion || 'v1').trim(),
        isActive: data.isActive ?? true
      },
      select: {
        id: true,
        provider: true,
        model: true,
        promptVersion: true,
        isActive: true,
        updatedAt: true
      }
    });
  }

  static async getAdminStatus(companyId: number): Promise<OpenAiAdminStatus> {
    const credential = await prisma.companyAiCredential.findUnique({
      where: {
        unique_ai_credential_per_company_provider: {
          companyId,
          provider: 'OPENAI'
        }
      },
      select: {
        id: true,
        provider: true,
        model: true,
        promptVersion: true,
        isActive: true,
        updatedAt: true,
        createdAt: true
      }
    });

    return {
      configured: !!credential,
      credential
    };
  }

  static async getTenantStatus(companyId: number): Promise<OpenAiTenantStatus> {
    const credential = await prisma.companyAiCredential.findUnique({
      where: {
        unique_ai_credential_per_company_provider: {
          companyId,
          provider: 'OPENAI'
        }
      },
      select: {
        model: true,
        promptVersion: true,
        isActive: true,
        updatedAt: true
      }
    });

    return {
      configured: !!credential,
      model: credential?.model || null,
      promptVersion: credential?.promptVersion || null,
      isActive: credential?.isActive ?? null,
      updatedAt: credential?.updatedAt || null,
      managedBy: 'PLATFORM_ADMIN'
    };
  }

  // Compatibilidade com chamadas internas legadas.
  static async getStatus(companyId: number): Promise<OpenAiAdminStatus> {
    return this.getAdminStatus(companyId);
  }

  static async getDecryptedCredential(companyId: number, requireActive = true): Promise<OpenAiCredentialDecrypted> {
    const credential = await prisma.companyAiCredential.findUnique({
      where: {
        unique_ai_credential_per_company_provider: {
          companyId,
          provider: 'OPENAI'
        }
      }
    });

    if (!credential) {
      throw new Error('Credencial OpenAI nao configurada para a empresa.');
    }

    if (requireActive && !credential.isActive) {
      throw new Error('Credencial OpenAI esta desativada para a empresa.');
    }

    const apiKey = decryptSecret(
      credential.apiKeyCiphertext,
      credential.apiKeyIv,
      credential.apiKeyTag
    );

    return {
      companyId: credential.companyId,
      provider: credential.provider,
      apiKey,
      model: credential.model,
      promptVersion: credential.promptVersion,
      isActive: credential.isActive,
      updatedAt: credential.updatedAt
    };
  }

  static async testCredential(data: { companyId: number; apiKey?: string; model?: string }) {
    const apiKey = data.apiKey?.trim() || (await this.getDecryptedCredential(data.companyId, false)).apiKey;

    if (!apiKey) {
      throw new Error('Nao foi possivel resolver a apiKey para teste.');
    }

    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    const raw = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: raw || 'Falha ao validar credencial OpenAI.'
      };
    }

    return {
      ok: true,
      status: response.status,
      message: 'Credencial validada com sucesso.',
      model: data.model || null
    };
  }
}

