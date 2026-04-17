import { Prisma, PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../utils/secret-crypto';
import GmailClientService, { GmailMessage, GmailMessagePayload } from './gmail-client.service';
import LegalEmailExtractionService from './legal-email-extraction.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

type SyncMode = 'manual' | 'polling' | 'push';

function base64UrlDecodeToUtf8(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function findHeader(payload: GmailMessagePayload | undefined, headerName: string): string | null {
  const headers = payload?.headers || [];
  const target = headerName.toLowerCase();

  for (const header of headers) {
    if (String(header.name || '').toLowerCase() === target) {
      return header.value || null;
    }
  }

  return null;
}

function extractPlainTextFromPayload(payload?: GmailMessagePayload): string {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    try {
      return base64UrlDecodeToUtf8(payload.body.data);
    } catch {
      return '';
    }
  }

  if (payload.parts?.length) {
    for (const part of payload.parts) {
      const text = extractPlainTextFromPayload(part);
      if (text.trim()) return text;
    }
  }

  if (payload.body?.data) {
    try {
      return base64UrlDecodeToUtf8(payload.body.data);
    } catch {
      return '';
    }
  }

  return '';
}

function safeDateFromInternalDate(internalDate?: string): Date {
  const parsed = internalDate ? Number(internalDate) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return new Date(parsed);
  }
  return new Date();
}

export default class EmailIngestionService {
  static async pollEnabledCompanies() {
    const companies = await prisma.emailIngestionConfig.findMany({
      where: { enabled: true },
      select: { companyId: true }
    });

    const results: Array<{ companyId: number; ok: boolean; summary: any }> = [];

    for (const item of companies) {
      try {
        const summary = await this.syncCompany(item.companyId, 'polling');
        results.push({ companyId: item.companyId, ok: true, summary });
      } catch (error: any) {
        results.push({ companyId: item.companyId, ok: false, summary: error.message || 'erro' });
      }
    }

    return results;
  }

  static async syncCompany(companyId: number, mode: SyncMode, force = false) {
    const connection = await prisma.gmailConnection.findUnique({ where: { companyId } });

    if (!connection || connection.status === 'DISCONNECTED' || connection.disabledAt) {
      throw new Error('Conexao Gmail inexistente ou desativada para a empresa.');
    }

    const config = await prisma.emailIngestionConfig.upsert({
      where: { companyId },
      update: {},
      create: { companyId }
    });

    if (!force && !config.enabled) {
      return {
        mode,
        skipped: true,
        reason: 'ingestion-disabled',
        companyId
      };
    }

    const refreshed = await this.refreshConnectionAccessToken(connection.id);

    const queryParts = [`newer_than:${config.lookbackDays}d`];
    if (config.subjectRequiredText?.trim()) {
      queryParts.push(`subject:"${config.subjectRequiredText.trim()}"`);
    }

    const query = queryParts.join(' ');

    const list = await GmailClientService.listMessages(refreshed.accessToken, {
      q: query,
      maxResults: config.maxEmailsPerRun
    });

    const messages = list.messages || [];
    const automationUserId = await this.resolveAutomationUserId(companyId);

    let createdProcesses = 0;
    let linkedImports = 0;
    let alreadyLinked = 0;
    let skipped = 0;

    let latestProcessedDate: Date | null = null;

    for (const summary of messages) {
      try {
        const message = await GmailClientService.getMessage(refreshed.accessToken, summary.id);
        const processed = await this.processGmailMessage({
          companyId,
          connectionId: connection.id,
          connectionEmail: connection.googleEmail,
          message,
          subjectRequiredText: config.subjectRequiredText,
          automationUserId
        });

        if (processed.kind === 'created') createdProcesses += 1;
        if (processed.kind === 'linked') linkedImports += 1;
        if (processed.kind === 'already-linked') alreadyLinked += 1;
        if (processed.kind === 'skipped') skipped += 1;

        if (processed.receivedAt && (!latestProcessedDate || processed.receivedAt > latestProcessedDate)) {
          latestProcessedDate = processed.receivedAt;
        }
      } catch (error: any) {
        logger.error('Falha ao processar mensagem Gmail', {
          companyId,
          connectionId: connection.id,
          mode,
          messageId: summary.id,
          error: error.message || String(error)
        });
      }
    }

    await prisma.gmailSyncState.upsert({
      where: { connectionId: connection.id },
      update: {
        lastPollingAt: mode === 'polling' ? new Date() : undefined,
        lastReconcileAt: mode === 'manual' ? new Date() : undefined,
        lastProcessedMessageAt: latestProcessedDate || undefined
      },
      create: {
        connectionId: connection.id,
        lastPollingAt: mode === 'polling' ? new Date() : null,
        lastReconcileAt: mode === 'manual' ? new Date() : null,
        lastProcessedMessageAt: latestProcessedDate || null
      }
    });

    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: {
        status: 'ACTIVE',
        lastError: null,
        disabledAt: null
      }
    });

    return {
      mode,
      skipped: false,
      companyId,
      query,
      scannedMessages: messages.length,
      createdProcesses,
      linkedImports,
      alreadyLinked,
      skippedMessages: skipped
    };
  }

  private static async processGmailMessage(data: {
    companyId: number;
    connectionId: number;
    connectionEmail: string;
    message: GmailMessage;
    subjectRequiredText: string;
    automationUserId: number;
  }): Promise<{ kind: 'created' | 'linked' | 'already-linked' | 'skipped'; receivedAt?: Date }> {
    const { companyId, connectionId, connectionEmail, message, subjectRequiredText, automationUserId } = data;

    const subject = findHeader(message.payload, 'Subject') || '';
    const from = findHeader(message.payload, 'From') || '';
    const receivedAt = safeDateFromInternalDate(message.internalDate);

    if (subjectRequiredText?.trim() && !subject.toLowerCase().includes(subjectRequiredText.toLowerCase())) {
      return { kind: 'skipped', receivedAt };
    }

    if (connectionEmail && from.toLowerCase().includes(connectionEmail.toLowerCase())) {
      return { kind: 'skipped', receivedAt };
    }

    const plainBody = extractPlainTextFromPayload(message.payload) || message.snippet || '';

    const extraction = await this.tryExtractLegalData(companyId, plainBody);

    const importRecord = await this.createOrGetInboundImport({
      companyId,
      connectionId,
      messageId: message.id,
      threadId: message.threadId,
      subject,
      from,
      receivedAt,
      extraction,
      snippet: message.snippet || null
    });

    if (importRecord.destinationType === 'PROCESS' && importRecord.destinationId) {
      return { kind: 'already-linked', receivedAt };
    }

    let process = await prisma.process.findFirst({
      where: {
        companyId,
        deletedAt: null,
        sourceProvider: 'GMAIL',
        sourceThreadId: message.threadId
      }
    });

    let created = false;

    if (!process) {
      process = await this.createProcessForThread({
        companyId,
        threadId: message.threadId,
        sourceImportId: importRecord.id,
        requestingLawyerName: extraction.advogado,
        claimantName: extraction.reclamante,
        notes: this.buildProcessNotes(subject, from, receivedAt),
        createdBy: automationUserId
      });

      created = !!process;
    }

    if (!process) {
      throw new Error(`Nao foi possivel resolver processo para thread ${message.threadId}.`);
    }

    if (importRecord.destinationType !== 'PROCESS' || importRecord.destinationId !== String(process.id)) {
      await prisma.inboundImport.update({
        where: { id: importRecord.id },
        data: {
          destinationType: 'PROCESS',
          destinationId: String(process.id),
          processedAt: new Date()
        }
      });
    }

    return {
      kind: created ? 'created' : 'linked',
      receivedAt
    };
  }

  private static async refreshConnectionAccessToken(connectionId: number): Promise<{ accessToken: string }> {
    const connection = await prisma.gmailConnection.findUnique({ where: { id: connectionId } });

    if (!connection) {
      throw new Error('Conexao Gmail nao encontrada.');
    }

    const refreshToken = decryptSecret(
      connection.refreshTokenCiphertext,
      connection.refreshTokenIv,
      connection.refreshTokenTag
    );

    try {
      const token = await GmailClientService.refreshAccessToken(refreshToken);
      const encryptedAccessToken = encryptSecret(token.access_token);

      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenCiphertext: encryptedAccessToken.ciphertext,
          accessTokenIv: encryptedAccessToken.iv,
          accessTokenTag: encryptedAccessToken.tag,
          accessTokenExpiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000),
          status: 'ACTIVE',
          lastError: null
        }
      });

      return { accessToken: token.access_token };
    } catch (error: any) {
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ERROR',
          lastError: error.message || String(error)
        }
      });
      throw error;
    }
  }

  private static async resolveAutomationUserId(companyId: number): Promise<number> {
    const admin = await prisma.userCompany.findFirst({
      where: {
        companyId,
        role: 'ADMIN'
      },
      select: { userId: true }
    });

    if (admin) return admin.userId;

    const superuser = await prisma.userCompany.findFirst({
      where: {
        companyId,
        role: 'SUPERUSER'
      },
      select: { userId: true }
    });

    if (superuser) return superuser.userId;

    const user = await prisma.userCompany.findFirst({
      where: { companyId },
      select: { userId: true }
    });

    if (!user) {
      throw new Error('Empresa sem usuarios vinculados para autoria da automacao.');
    }

    return user.userId;
  }

  private static async createOrGetInboundImport(data: {
    companyId: number;
    connectionId: number;
    messageId: string;
    threadId: string;
    subject: string;
    from: string;
    receivedAt: Date;
    extraction: { advogado: string | null; reclamante: string | null };
    snippet: string | null;
  }) {
    const payloadMetadata = {
      gmailMessageId: data.messageId,
      gmailThreadId: data.threadId,
      receivedAt: data.receivedAt.toISOString(),
      from: data.from || null,
      subject: data.subject || null,
      snippet: data.snippet,
      extracted: {
        advogado: data.extraction.advogado,
        reclamante: data.extraction.reclamante
      }
    };

    try {
      return await prisma.inboundImport.create({
        data: {
          companyId: data.companyId,
          connectionId: data.connectionId,
          sourceType: 'EMAIL',
          externalId: data.messageId,
          externalThreadId: data.threadId,
          payloadMetadata: payloadMetadata as Prisma.InputJsonValue,
          sourceReceivedAt: data.receivedAt
        }
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;

      const existing = await prisma.inboundImport.findUnique({
        where: {
          unique_inbound_import_per_company_source: {
            companyId: data.companyId,
            sourceType: 'EMAIL',
            externalId: data.messageId
          }
        }
      });

      if (!existing) {
        throw new Error(`Importacao existente nao encontrada para messageId=${data.messageId}`);
      }

      return prisma.inboundImport.update({
        where: { id: existing.id },
        data: {
          connectionId: data.connectionId,
          externalThreadId: data.threadId,
          payloadMetadata: payloadMetadata as Prisma.InputJsonValue,
          sourceReceivedAt: data.receivedAt
        }
      });
    }
  }

  private static async createProcessForThread(data: {
    companyId: number;
    threadId: string;
    sourceImportId: number;
    requestingLawyerName: string | null;
    claimantName: string | null;
    notes: string;
    createdBy: number;
  }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.process.create({
          data: {
            companyId: data.companyId,
            status: 'SOLICITACAO',
            originType: 'IMPORT',
            sourceImportId: data.sourceImportId,
            sourceProvider: 'GMAIL',
            sourceThreadId: data.threadId,
            requestingLawyerName: data.requestingLawyerName,
            claimantName: data.claimantName,
            notes: data.notes,
            createdBy: data.createdBy,
            updatedBy: data.createdBy
          }
        });

        await tx.processStatusHistory.create({
          data: {
            processId: created.id,
            fromStatus: null,
            toStatus: 'SOLICITACAO',
            changedBy: data.createdBy,
            reason: 'Criado automaticamente por integracao Gmail'
          }
        });

        return created;
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;

      return prisma.process.findFirst({
        where: {
          companyId: data.companyId,
          sourceProvider: 'GMAIL',
          sourceThreadId: data.threadId,
          deletedAt: null
        }
      });
    }
  }

  private static buildProcessNotes(subject: string, from: string, receivedAt: Date): string {
    return [
      'Origem: integracao Gmail',
      `Assunto: ${subject || '-'}`,
      `Remetente: ${from || '-'}`,
      `Recebido em: ${receivedAt.toISOString()}`
    ]
      .join(' | ')
      .substring(0, 2800);
  }

  private static async tryExtractLegalData(companyId: number, plainBody: string) {
    try {
      if (!plainBody.trim()) {
        return { advogado: null, reclamante: null };
      }
      return await LegalEmailExtractionService.extract(companyId, plainBody);
    } catch (error: any) {
      logger.warn('Falha na extracao juridica por IA. Seguindo sem campos extraidos.', {
        companyId,
        error: error.message || String(error)
      });
      return { advogado: null, reclamante: null };
    }
  }
}

