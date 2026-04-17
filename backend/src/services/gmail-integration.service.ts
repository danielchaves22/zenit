import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { INTEGRATIONS_CONFIG, JWT_SECRET } from '../config';
import { decryptSecret, encryptSecret } from '../utils/secret-crypto';
import GmailClientService from './gmail-client.service';
import EmailIngestionService from './email-ingestion.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

type OAuthStatePayload = {
  companyId: number;
  nonce: string;
};

export default class GmailIntegrationService {
  static createOAuthStartUrl(companyId: number): { authUrl: string; state: string } {
    const statePayload: OAuthStatePayload = {
      companyId,
      nonce: `${Date.now()}-${Math.random().toString(16).slice(2)}`
    };

    const state = jwt.sign(statePayload, JWT_SECRET, { expiresIn: '15m' });
    const authUrl = GmailClientService.buildAuthUrl(state);

    return { authUrl, state };
  }

  static async handleOAuthCallback(code: string, state: string) {
    const payload = jwt.verify(state, JWT_SECRET) as OAuthStatePayload;

    if (!payload.companyId) {
      throw new Error('State OAuth invalido: companyId ausente.');
    }

    const tokenData = await GmailClientService.exchangeCodeForTokens(code);
    const profile = await GmailClientService.getProfile(tokenData.access_token);
    let watchExpiration: Date | null = null;

    if (INTEGRATIONS_CONFIG.gmailPubSubTopic) {
      try {
        const watch = await GmailClientService.startWatch(tokenData.access_token, INTEGRATIONS_CONFIG.gmailPubSubTopic);
        if (watch?.expiration) {
          watchExpiration = new Date(Number(watch.expiration));
        }
      } catch (watchError: any) {
        logger.warn('Falha ao registrar watch do Gmail durante OAuth callback', {
          companyId: payload.companyId,
          error: watchError.message || String(watchError)
        });
      }
    }

    const existing = await prisma.gmailConnection.findUnique({
      where: { companyId: payload.companyId }
    });

    const resolvedRefreshToken = tokenData.refresh_token
      ? tokenData.refresh_token
      : existing
      ? decryptSecret(existing.refreshTokenCiphertext, existing.refreshTokenIv, existing.refreshTokenTag)
      : null;

    if (!resolvedRefreshToken) {
      throw new Error('Google nao retornou refresh_token e nao havia token anterior. Refaça conexao com consentimento.');
    }

    const encryptedRefresh = encryptSecret(resolvedRefreshToken);
    const encryptedAccess = encryptSecret(tokenData.access_token);

    const connection = await prisma.gmailConnection.upsert({
      where: { companyId: payload.companyId },
      update: {
        googleEmail: profile.emailAddress,
        googleUserId: profile.emailAddress,
        refreshTokenCiphertext: encryptedRefresh.ciphertext,
        refreshTokenIv: encryptedRefresh.iv,
        refreshTokenTag: encryptedRefresh.tag,
        accessTokenCiphertext: encryptedAccess.ciphertext,
        accessTokenIv: encryptedAccess.iv,
        accessTokenTag: encryptedAccess.tag,
        accessTokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
        watchExpiration,
        status: 'ACTIVE',
        disabledAt: null,
        lastError: null
      },
      create: {
        companyId: payload.companyId,
        googleEmail: profile.emailAddress,
        googleUserId: profile.emailAddress,
        refreshTokenCiphertext: encryptedRefresh.ciphertext,
        refreshTokenIv: encryptedRefresh.iv,
        refreshTokenTag: encryptedRefresh.tag,
        accessTokenCiphertext: encryptedAccess.ciphertext,
        accessTokenIv: encryptedAccess.iv,
        accessTokenTag: encryptedAccess.tag,
        accessTokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
        watchExpiration,
        status: 'ACTIVE'
      }
    });

    await prisma.gmailSyncState.upsert({
      where: { connectionId: connection.id },
      update: {
        lastHistoryId: profile.historyId || null
      },
      create: {
        connectionId: connection.id,
        lastHistoryId: profile.historyId || null
      }
    });

    await prisma.emailIngestionConfig.upsert({
      where: { companyId: payload.companyId },
      update: {},
      create: { companyId: payload.companyId }
    });

    return {
      companyId: payload.companyId,
      googleEmail: profile.emailAddress,
      connectionId: connection.id
    };
  }

  static async getStatus(companyId: number) {
    const [connection, config, syncState] = await Promise.all([
      prisma.gmailConnection.findUnique({
        where: { companyId },
        select: {
          id: true,
          companyId: true,
          googleEmail: true,
          status: true,
          watchExpiration: true,
          lastError: true,
          disabledAt: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.emailIngestionConfig.upsert({
        where: { companyId },
        update: {},
        create: { companyId }
      }),
      prisma.gmailConnection.findUnique({
        where: { companyId },
        select: {
          id: true,
          syncState: {
            select: {
              lastHistoryId: true,
              lastPollingAt: true,
              lastReconcileAt: true,
              lastProcessedMessageAt: true,
              updatedAt: true
            }
          }
        }
      })
    ]);

    return {
      connected: !!connection,
      connection,
      config,
      syncState: syncState?.syncState || null
    };
  }

  static async updateConfig(
    companyId: number,
    data: {
      enabled?: boolean;
      subjectRequiredText?: string;
      lookbackDays?: number;
      pollingIntervalMinutes?: number;
      reconciliationIntervalMinutes?: number;
      maxEmailsPerRun?: number;
    }
  ) {
    return prisma.emailIngestionConfig.upsert({
      where: { companyId },
      update: {
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.subjectRequiredText !== undefined && { subjectRequiredText: data.subjectRequiredText.trim() }),
        ...(data.lookbackDays !== undefined && { lookbackDays: data.lookbackDays }),
        ...(data.pollingIntervalMinutes !== undefined && { pollingIntervalMinutes: data.pollingIntervalMinutes }),
        ...(data.reconciliationIntervalMinutes !== undefined && {
          reconciliationIntervalMinutes: data.reconciliationIntervalMinutes
        }),
        ...(data.maxEmailsPerRun !== undefined && { maxEmailsPerRun: data.maxEmailsPerRun })
      },
      create: {
        companyId,
        enabled: data.enabled ?? false,
        subjectRequiredText: data.subjectRequiredText?.trim() || 'Inicial Trabalhista',
        lookbackDays: data.lookbackDays ?? 3,
        pollingIntervalMinutes: data.pollingIntervalMinutes ?? 5,
        reconciliationIntervalMinutes: data.reconciliationIntervalMinutes ?? 60,
        maxEmailsPerRun: data.maxEmailsPerRun ?? 50
      }
    });
  }

  static async disconnect(companyId: number) {
    const existing = await prisma.gmailConnection.findUnique({ where: { companyId } });

    if (!existing) {
      throw new Error('Conexao Gmail nao encontrada para a empresa.');
    }

    return prisma.gmailConnection.update({
      where: { companyId },
      data: {
        status: 'DISCONNECTED',
        disabledAt: new Date(),
        lastError: null
      },
      select: {
        id: true,
        companyId: true,
        status: true,
        disabledAt: true,
        updatedAt: true
      }
    });
  }

  static async syncNow(companyId: number) {
    return EmailIngestionService.syncCompany(companyId, 'manual', true);
  }

  static getCallbackRedirectBase(): string {
    return INTEGRATIONS_CONFIG.frontendUrl || '';
  }
}
