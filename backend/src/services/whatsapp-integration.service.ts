import prisma from '../lib/prisma';
import {
  AppKey,
  AssistantMessageRole,
  Role,
  WhatsAppBindingChallengeStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageKind
} from '@prisma/client';
import crypto from 'crypto';
import WhatsAppAudioService from './whatsapp-audio.service';
import { WhatsAppAudioError } from '../utils/whatsapp-audio';
import { AsyncLocalStorage } from 'node:async_hooks';
import ToolExecutorService from './tool-executor.service';
import AssistantOrchestratorService from './assistant-orchestrator.service';
import AssistantSessionService from './assistant-session.service';
import AssistantMessageService from './assistant-message.service';
import PendingActionService from './pending-action.service';
import type { PendingAction } from '@zenit/assistant-contracts';
import AppAccessService from './app-access.service';
import UserService from './user.service';
import WhatsAppCloudApiService, { WhatsAppReplyButton } from './whatsapp-cloud-api.service';
import { buildPendingActionButtons, formatWhatsAppDraft, parsePendingActionButton } from '../utils/whatsapp-pending-action';
import { INTEGRATIONS_CONFIG } from '../config';
import { logger } from '../utils/logger';

export type HubCashReply = { text: string; buttons?: WhatsAppReplyButton[] };
const hubReplies = new AsyncLocalStorage<HubCashReply[]>();
const HUB_READ_TOOLS = new Set(['get_financial_overview', 'get_due_obligations', 'get_credit_card_overview', 'get_recent_transactions']);


type CompanyChannelAccess = {
  allowed: boolean;
  appKey: string;
  enabled: boolean;
  granted: boolean;
};

type UserCompanyChannelView = {
  app: CompanyChannelAccess;
  companyId: number;
  companyName: string;
  isCurrent: boolean;
  role: Role;
};

type WebhookValue = {
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<Record<string, any>>;
  statuses?: Array<Record<string, any>>;
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function normalizeDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneNumber(value: string | null | undefined): string {
  const digits = normalizeDigits(value);
  return digits ? `+${digits}` : '';
}

function maskWaId(value: string | null | undefined): string {
  const digits = normalizeDigits(value);
  if (!digits) {
    return 'unknown';
  }

  if (digits.length <= 4) {
    return digits;
  }

  return `${digits.slice(0, 2)}***${digits.slice(-4)}`;
}

function summarizeWebhookEnvelope(payload: Record<string, any>) {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const changeCount = entries.reduce((total, entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return total + changes.length;
  }, 0);
  const messageCount = entries.reduce((total, entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return total + changes.reduce((changeTotal: number, change: any) => {
      const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
      return changeTotal + messages.length;
    }, 0);
  }, 0);
  const statusCount = entries.reduce((total, entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return total + changes.reduce((changeTotal: number, change: any) => {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      return changeTotal + statuses.length;
    }, 0);
  }, 0);

  return {
    changeCount,
    entryCount: entries.length,
    messageCount,
    statusCount
  };
}

function chunkMessage(text: string, maxLength = 1200): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const breakIndex = Math.max(candidate.lastIndexOf('\n\n'), candidate.lastIndexOf('\n'));
    const splitIndex = breakIndex >= Math.floor(maxLength * 0.5) ? breakIndex : maxLength;
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function extractInboundText(message: Record<string, any>): string | null {
  const type = String(message.type || '').toLowerCase();

  if (type === 'text') {
    return typeof message.text?.body === 'string' ? message.text.body.trim() : null;
  }

  if (type === 'button') {
    return typeof message.button?.text === 'string' ? message.button.text.trim() : null;
  }

  if (type === 'interactive') {
    const title =
      message.interactive?.button_reply?.title || message.interactive?.list_reply?.title;
    return typeof title === 'string' ? title.trim() : null;
  }

  return null;
}

function mapMessageKind(message: Record<string, any>): WhatsAppMessageKind {
  const type = String(message.type || '').toLowerCase();
  // Keep the original media type in payload; the text field holds its transcript.
  if (type === 'audio') return WhatsAppMessageKind.SYSTEM;
  if (type === 'interactive' || type === 'button') {
    return WhatsAppMessageKind.INTERACTIVE;
  }
  return WhatsAppMessageKind.TEXT;
}

function extractBindingCode(text: string | null): string | null {
  const match = String(text || '').toUpperCase().match(/\bZENIT-[A-Z0-9]{6,10}\b/);
  return match ? match[0] : null;
}

async function resolveUserCompanies(userId: number, currentCompanyId?: number | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      companies: {
        include: {
          company: true
        },
        orderBy: [{ isDefault: 'desc' }, { companyId: 'asc' }]
      }
    }
  });

  if (!user) {
    throw new Error('Usuario nao encontrado para integracao WhatsApp.');
  }

  const companies = await Promise.all(
    user.companies.map(async (membership) => {
      const appAccess = await AppAccessService.getEffectiveAccess(userId, membership.companyId);
      const whatsappAccess =
        appAccess.find((entry) => entry.appKey === 'zenit-whatsapp') || {
          appKey: 'zenit-whatsapp',
          enabled: false,
          granted: false,
          allowed: false
        };

      return {
        companyId: membership.companyId,
        companyName: membership.company.name,
        role: membership.role,
        isCurrent: membership.companyId === currentCompanyId,
        app: whatsappAccess
      } satisfies UserCompanyChannelView;
    })
  );

  return {
    user,
    companies
  };
}

async function ensureChannelAllowedCompany(params: {
  companyId?: number | null;
  currentCompanyId?: number | null;
  userId: number;
}) {
  const { companies } = await resolveUserCompanies(params.userId, params.currentCompanyId);
  const allowedCompanies = companies.filter((company) => company.app.allowed);

  if (allowedCompanies.length === 0) {
    throw new Error('Canal do WhatsApp nao habilitado para nenhuma empresa do usuario.');
  }

  if (params.companyId) {
    const requested = allowedCompanies.find((company) => company.companyId === params.companyId);
    if (requested) {
      return {
        allowedCompanies,
        selectedCompany: requested
      };
    }
  }

  const currentAllowed = allowedCompanies.find(
    (company) => company.companyId === params.currentCompanyId
  );

  return {
    allowedCompanies,
    selectedCompany: currentAllowed || allowedCompanies[0]
  };
}

async function ensureBindingCompanyContext(params: {
  bindingId: number;
  companyId: number;
  userId: number;
}) {
  const existing = await prisma.whatsAppBindingCompanyContext.findUnique({
    where: {
      unique_whatsapp_binding_company_context: {
        bindingId: params.bindingId,
        companyId: params.companyId
      }
    }
  });

  if (existing) {
    return existing;
  }

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { name: true }
  });

  const session = await AssistantSessionService.createSession({
    userId: params.userId,
    companyId: params.companyId,
    title: `WhatsApp - ${company?.name || 'Zenit'}`
  });

  return prisma.whatsAppBindingCompanyContext.create({
    data: {
      bindingId: params.bindingId,
      companyId: params.companyId,
      assistantSessionId: session.id
    }
  });
}

async function recordMessageLog(params: {
  assistantSessionId?: number | null;
  bindingId?: number | null;
  companyId?: number | null;
  createdAt?: Date;
  direction: WhatsAppMessageDirection;
  failedAt?: Date | null;
  kind: WhatsAppMessageKind;
  payload?: Record<string, unknown> | null;
  phoneNumber?: string | null;
  readAt?: Date | null;
  status?: string | null;
  text?: string | null;
  userId?: number | null;
  waId: string;
  whatsappMessageId?: string | null;
}) {
  if (params.whatsappMessageId) {
    const existing = await prisma.whatsAppMessageLog.findUnique({
      where: { whatsappMessageId: params.whatsappMessageId }
    });

    if (existing) {
      if (params.direction === WhatsAppMessageDirection.INBOUND) {
        throw new Error('whatsapp_inbound_duplicate');
      }
      return existing;
    }
  }

  return prisma.whatsAppMessageLog.create({
    data: {
      assistantSessionId: params.assistantSessionId ?? null,
      bindingId: params.bindingId ?? null,
      companyId: params.companyId ?? null,
      createdAt: params.createdAt ?? new Date(),
      direction: params.direction,
      failedAt: params.failedAt ?? null,
      kind: params.kind,
      payload: params.payload ? (params.payload as any) : undefined,
      phoneNumber: params.phoneNumber ?? null,
      readAt: params.readAt ?? null,
      status: params.status ?? null,
      text: params.text ?? null,
      userId: params.userId ?? null,
      waId: params.waId,
      whatsappMessageId: params.whatsappMessageId ?? null
    }
  });
}

export default class WhatsAppIntegrationService {
  // The first-party Hub authenticates the channel. Cash resolves the verified
  // binding and current permissions; no user/company/role supplied by Hub is trusted.
  static async getHubBinding(waId: string) {
    const binding = await prisma.whatsAppUserBinding.findUnique({ where: { waId } });
    if (!binding) return null;
    const context = await UserService.getUserCompanyContext(binding.userId, binding.activeCompanyId);
    if (!context || !await AppAccessService.hasEffectiveAccess(binding.userId, binding.activeCompanyId, AppKey.ZENIT_WHATSAPP) ||
        !await AppAccessService.hasEffectiveAccess(binding.userId, binding.activeCompanyId, AppKey.ZENIT_CASH)) return null;
    return { binding, role: context.role };
  }

  static async queryForHub(waId: string, tool: string, args: Record<string, unknown>) {
    if (!HUB_READ_TOOLS.has(tool)) throw new Error('Operacao de leitura nao permitida.');
    const current = await this.getHubBinding(waId);
    if (!current) throw new Error('Conexao Cash ausente ou sem permissao.');
    const { binding, role } = current;
    const context = await ensureBindingCompanyContext({ bindingId: binding.id, companyId: binding.activeCompanyId, userId: binding.userId });
    return ToolExecutorService.executeTool(tool, args, {
      sessionId: context.assistantSessionId, turnId: 0, userId: binding.userId,
      companyId: binding.activeCompanyId, role, mode: 'OPERATOR'
    });
  }

  static async dispatchForHub(params: { waId: string; messageId: string; text: string; buttonId?: string; audio?: { mediaId: string } }) {
    if (params.audio && (params.text.trim() || params.buttonId !== undefined || !/^\d{1,128}$/.test(params.audio.mediaId))) {
      throw new Error('Mensagem de audio invalida.');
    }
    const existing = await prisma.whatsAppMessageLog.findUnique({ where: { whatsappMessageId: params.messageId } });
    if (existing) {
      if (existing.waId !== params.waId) throw new Error('Mensagem pertence a outro remetente.');
      if (!await this.getHubBinding(params.waId)) return { replies: [{ text: 'Conexao Cash ausente ou sem permissao.' }] };
      // Never replay private content from a receipt: workspace/account permissions
      // may have changed since it was produced. A fresh query checks them again.
      return { replies: [{ text: 'Esta mensagem ja foi recebida pelo Cash. Consulte o estado atual antes de repetir a operacao.' }] };
    }
    const receipt = await prisma.whatsAppMessageLog.create({ data: {
      waId: params.waId, whatsappMessageId: params.messageId, direction: 'INBOUND',
      kind: params.audio ? 'SYSTEM' : params.buttonId ? 'INTERACTIVE' : 'TEXT', text: params.text, status: 'hub_processing',
      ...(params.audio ? { payload: { type: 'audio', audio: { id: params.audio.mediaId } } } : {})
    } });
    const replies: HubCashReply[] = [];
    try {
      await hubReplies.run(replies, async () => {
        if (!params.audio) {
          const consumed = await this.consumeBindingChallenge({ text: params.text, waId: params.waId, incomingMessageId: params.messageId });
          if (consumed.consumed) return;
        }
        const current = await this.getHubBinding(params.waId);
        if (!current) {
          replies.push({ text: 'Conecte sua conta pelo QR Code no perfil do Cash. Se ela ja estiver conectada, confira suas permissoes no Cash.' });
          return;
        }
        await this.processBoundMessage({ binding: current.binding, incomingMessageId: params.messageId,
          interactiveReplyId: params.buttonId, text: params.text, waId: params.waId, audio: params.audio });
      });
      await prisma.whatsAppMessageLog.update({ where: { id: receipt.id }, data: { status: 'hub_completed',
        payload: { hubReplies: replies, ...(params.audio ? { type: 'audio', audio: { id: params.audio.mediaId } } : {}) } } });
      return { replies };
    } catch (error) {
      await prisma.whatsAppMessageLog.update({ where: { id: receipt.id }, data: { status: 'hub_uncertain' } });
      throw error;
    }
  }

  static async expirePendingChallenges(userId?: number) {
    await prisma.whatsAppBindingChallenge.updateMany({
      where: {
        status: WhatsAppBindingChallengeStatus.PENDING,
        expiresAt: { lt: new Date() },
        ...(userId ? { userId } : {})
      },
      data: {
        status: WhatsAppBindingChallengeStatus.EXPIRED
      }
    });
  }

  static async getStatus(params: { currentCompanyId?: number | null; userId: number }) {
    await this.expirePendingChallenges(params.userId);

    const [{ companies }, binding, pendingChallenge] = await Promise.all([
      resolveUserCompanies(params.userId, params.currentCompanyId),
      prisma.whatsAppUserBinding.findUnique({
        where: { userId: params.userId },
        include: {
          activeCompany: {
            select: { id: true, name: true }
          }
        }
      }),
      prisma.whatsAppBindingChallenge.findFirst({
        where: {
          userId: params.userId,
          status: WhatsAppBindingChallengeStatus.PENDING,
          expiresAt: { gt: new Date() }
        },
        include: {
          preferredCompany: {
            select: { id: true, name: true }
          }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      })
    ]);

    const backendConfig = WhatsAppCloudApiService.getConfigurationStatus();

    return {
      backendConfig,
      binding: binding
        ? {
            activeCompanyId: binding.activeCompanyId,
            activeCompanyName: binding.activeCompany.name,
            connectedAt: toIso(binding.createdAt),
            displayName: binding.displayName,
            lastInboundAt: toIso(binding.lastInboundAt),
            lastOutboundAt: toIso(binding.lastOutboundAt),
            phoneNumber: binding.phoneNumber,
            waId: binding.waId
          }
        : null,
      companies: companies.map((company) => ({
        companyId: company.companyId,
        companyName: company.companyName,
        isCurrent: company.isCurrent,
        role: company.role,
        whatsappAccess: company.app
      })),
      pendingChallenge: pendingChallenge
        ? {
            code: pendingChallenge.code,
            deepLinkUrl: WhatsAppCloudApiService.buildDeepLink(
              WhatsAppCloudApiService.getBindingPrefillMessage(pendingChallenge.code)
            ),
            expiresAt: toIso(pendingChallenge.expiresAt),
            preferredCompanyId: pendingChallenge.preferredCompanyId,
            preferredCompanyName: pendingChallenge.preferredCompany.name,
            qrPayload:
              WhatsAppCloudApiService.buildDeepLink(
                WhatsAppCloudApiService.getBindingPrefillMessage(pendingChallenge.code)
              ) || pendingChallenge.code,
            text: WhatsAppCloudApiService.getBindingPrefillMessage(pendingChallenge.code)
          }
        : null
    };
  }

  static async createBindingChallenge(params: {
    currentCompanyId?: number | null;
    preferredCompanyId?: number | null;
    userId: number;
  }) {
    const backendConfig = WhatsAppCloudApiService.getConfigurationStatus();
    if (!backendConfig.ready) {
      throw new Error('Backend do WhatsApp ainda nao esta configurado por completo.');
    }

    const { selectedCompany } = await ensureChannelAllowedCompany({
      userId: params.userId,
      currentCompanyId: params.currentCompanyId,
      companyId: params.preferredCompanyId
    });

    await prisma.whatsAppBindingChallenge.updateMany({
      where: {
        userId: params.userId,
        status: WhatsAppBindingChallengeStatus.PENDING
      },
      data: {
        status: WhatsAppBindingChallengeStatus.CANCELED,
        canceledAt: new Date()
      }
    });

    let code = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `ZENIT-${crypto.randomBytes(4).toString('hex').slice(0, 8).toUpperCase()}`;
      const exists = await prisma.whatsAppBindingChallenge.findUnique({
        where: { code: candidate }
      });
      if (!exists) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new Error('Nao foi possivel gerar um codigo de vinculacao do WhatsApp.');
    }

    const expiresAt = new Date(
      Date.now() + INTEGRATIONS_CONFIG.whatsappBindingChallengeTtlMinutes * 60 * 1000
    );

    const challenge = await prisma.whatsAppBindingChallenge.create({
      data: {
        code,
        expiresAt,
        preferredCompanyId: selectedCompany.companyId,
        userId: params.userId
      },
      include: {
        preferredCompany: {
          select: { id: true, name: true }
        }
      }
    });

    const text = WhatsAppCloudApiService.getBindingPrefillMessage(challenge.code);
    const deepLinkUrl = WhatsAppCloudApiService.buildDeepLink(text);

    return {
      code: challenge.code,
      deepLinkUrl,
      expiresAt: toIso(challenge.expiresAt),
      preferredCompanyId: challenge.preferredCompanyId,
      preferredCompanyName: challenge.preferredCompany.name,
      qrPayload: deepLinkUrl || challenge.code,
      text
    };
  }

  static async disconnectBinding(params: { userId: number }) {
    const binding = await prisma.whatsAppUserBinding.findUnique({
      where: { userId: params.userId }
    });

    await prisma.whatsAppBindingChallenge.updateMany({
      where: {
        userId: params.userId,
        status: WhatsAppBindingChallengeStatus.PENDING
      },
      data: {
        status: WhatsAppBindingChallengeStatus.CANCELED,
        canceledAt: new Date()
      }
    });

    if (!binding) {
      return { disconnected: false };
    }

    await prisma.whatsAppUserBinding.delete({
      where: { id: binding.id }
    });

    return { disconnected: true };
  }

  static async updateActiveCompany(params: { companyId: number; userId: number }) {
    const binding = await prisma.whatsAppUserBinding.findUnique({
      where: { userId: params.userId }
    });

    if (!binding) {
      throw new Error('Nenhum numero de WhatsApp conectado para este usuario.');
    }

    const { selectedCompany } = await ensureChannelAllowedCompany({
      userId: params.userId,
      companyId: params.companyId,
      currentCompanyId: params.companyId
    });

    await prisma.whatsAppUserBinding.update({
      where: { id: binding.id },
      data: {
        activeCompanyId: selectedCompany.companyId
      }
    });

    await ensureBindingCompanyContext({
      bindingId: binding.id,
      companyId: selectedCompany.companyId,
      userId: params.userId
    });

    return {
      activeCompanyId: selectedCompany.companyId,
      activeCompanyName: selectedCompany.companyName
    };
  }

  static async verifyWebhookRequest(rawBody: Buffer | undefined, signatureHeader: string | null) {
    return WhatsAppCloudApiService.verifySignature(rawBody, signatureHeader);
  }

  private static async sendOutboundMessage(params: {
    assistantSessionId?: number | null;
    bindingId?: number | null;
    companyId?: number | null;
    replyToMessageId?: string | null;
    text: string;
    buttons?: WhatsAppReplyButton[];
    userId?: number | null;
    waId: string;
  }) {
    try {
      const captured = hubReplies.getStore();
      if (captured) {
        captured.push({ text: params.text, ...(params.buttons ? { buttons: params.buttons } : {}) });
        return;
      }
      logger.debug(
        `WhatsApp outbound send attempt ${JSON.stringify({
          assistantSessionId: params.assistantSessionId ?? null,
          bindingId: params.bindingId ?? null,
          companyId: params.companyId ?? null,
          replyToMessageId: params.replyToMessageId ?? null,
          textLength: params.text.length,
          userId: params.userId ?? null,
          waId: maskWaId(params.waId)
        })}`
      );

      const messageParams = {
        replyToMessageId: params.replyToMessageId,
        text: params.text,
        to: params.waId
      };
      const sent = params.buttons
        ? await WhatsAppCloudApiService.sendReplyButtons({ ...messageParams, buttons: params.buttons })
        : await WhatsAppCloudApiService.sendTextMessage(messageParams);

      logger.debug(
        `WhatsApp outbound send succeeded ${JSON.stringify({
          assistantSessionId: params.assistantSessionId ?? null,
          bindingId: params.bindingId ?? null,
          companyId: params.companyId ?? null,
          messageId: sent.messageId,
          userId: params.userId ?? null,
          waId: maskWaId(params.waId)
        })}`
      );

      await recordMessageLog({
        assistantSessionId: params.assistantSessionId,
        bindingId: params.bindingId,
        companyId: params.companyId,
        direction: WhatsAppMessageDirection.OUTBOUND,
        kind: params.buttons ? WhatsAppMessageKind.INTERACTIVE : WhatsAppMessageKind.TEXT,
        payload: sent.raw,
        phoneNumber: normalizePhoneNumber(params.waId),
        status: 'sent',
        text: params.text,
        userId: params.userId,
        waId: params.waId,
        whatsappMessageId: sent.messageId
      });

      if (params.bindingId) {
        await prisma.whatsAppUserBinding.update({
          where: { id: params.bindingId },
          data: {
            lastOutboundAt: new Date()
          }
        });
      }
    } catch (error) {
      logger.error(
        `WhatsApp outbound send failed ${JSON.stringify({
          assistantSessionId: params.assistantSessionId ?? null,
          bindingId: params.bindingId ?? null,
          companyId: params.companyId ?? null,
          error: error instanceof Error ? error.message : String(error),
          replyToMessageId: params.replyToMessageId ?? null,
          userId: params.userId ?? null,
          waId: maskWaId(params.waId)
        })}`
      );

      await recordMessageLog({
        assistantSessionId: params.assistantSessionId,
        bindingId: params.bindingId,
        companyId: params.companyId,
        direction: WhatsAppMessageDirection.OUTBOUND,
        failedAt: new Date(),
        kind: params.buttons ? WhatsAppMessageKind.INTERACTIVE : WhatsAppMessageKind.TEXT,
        payload: {
          error: error instanceof Error ? error.message : String(error)
        },
        phoneNumber: normalizePhoneNumber(params.waId),
        status: 'failed',
        text: params.text,
        userId: params.userId,
        waId: params.waId
      });

      throw error;
    }
  }

  private static async consumeBindingChallenge(params: {
    incomingMessageId?: string | null;
    profileName?: string | null;
    text: string | null;
    waId: string;
  }) {
    const code = extractBindingCode(params.text);
    if (!code) {
      return { consumed: false as const };
    }

    await this.expirePendingChallenges();

    const challenge = await prisma.whatsAppBindingChallenge.findFirst({
      where: {
        code,
        status: WhatsAppBindingChallengeStatus.PENDING,
        expiresAt: { gt: new Date() }
      }
    });

    if (!challenge) {
      await this.sendOutboundMessage({
        text: 'Codigo de vinculacao invalido ou expirado. Gere um novo QR Code no seu perfil do Zenit.',
        waId: params.waId
      });

      return { consumed: true as const };
    }

    const { selectedCompany } = await ensureChannelAllowedCompany({
      userId: challenge.userId,
      companyId: challenge.preferredCompanyId,
      currentCompanyId: challenge.preferredCompanyId
    });

    const existingBindingByWaId = await prisma.whatsAppUserBinding.findUnique({
      where: { waId: params.waId }
    });

    if (existingBindingByWaId && existingBindingByWaId.userId !== challenge.userId) {
      await this.sendOutboundMessage({
        text: 'Este numero de WhatsApp ja esta vinculado a outro usuario do Zenit.',
        waId: params.waId
      });

      return { consumed: true as const };
    }

    const existingBindingByUser = await prisma.whatsAppUserBinding.findUnique({
      where: { userId: challenge.userId }
    });

    const phoneNumber = normalizePhoneNumber(params.waId);

    if (
      existingBindingByUser &&
      existingBindingByUser.waId !== params.waId &&
      existingBindingByWaId &&
      existingBindingByWaId.userId !== challenge.userId
    ) {
      await this.sendOutboundMessage({
        text: 'Nao foi possivel concluir o vinculo porque este numero ja esta em uso por outro usuario.',
        waId: params.waId
      });

      return { consumed: true as const };
    }

    const binding = existingBindingByUser
      ? await prisma.whatsAppUserBinding.update({
          where: { id: existingBindingByUser.id },
          data: {
            activeCompanyId: selectedCompany.companyId,
            displayName: params.profileName || existingBindingByUser.displayName,
            lastInboundAt: new Date(),
            phoneNumber,
            waId: params.waId
          }
        })
      : await prisma.whatsAppUserBinding.create({
          data: {
            activeCompanyId: selectedCompany.companyId,
            displayName: params.profileName || null,
            lastInboundAt: new Date(),
            phoneNumber,
            userId: challenge.userId,
            waId: params.waId
          }
        });

    await ensureBindingCompanyContext({
      bindingId: binding.id,
      companyId: selectedCompany.companyId,
      userId: challenge.userId
    });

    await prisma.whatsAppBindingChallenge.updateMany({
      where: {
        userId: challenge.userId,
        status: WhatsAppBindingChallengeStatus.PENDING
      },
      data: {
        status: WhatsAppBindingChallengeStatus.CANCELED,
        canceledAt: new Date()
      }
    });

    await prisma.whatsAppBindingChallenge.update({
      where: { id: challenge.id },
      data: {
        status: WhatsAppBindingChallengeStatus.CONFIRMED,
        confirmedAt: new Date(),
        canceledAt: null
      }
    });

    await this.sendOutboundMessage({
      bindingId: binding.id,
      companyId: binding.activeCompanyId,
      replyToMessageId: params.incomingMessageId,
      text: `Conexao concluida com o Zenit. Empresa ativa: ${selectedCompany.companyName}. Agora voce pode pedir lancamentos, consultar categorias e confirmar rascunhos por aqui.`,
      userId: challenge.userId,
      waId: params.waId
    });

    return {
      binding,
      consumed: true as const
    };
  }

  private static async withTypingIndicator<T>(messageId: string | null | undefined, work: () => Promise<T>) {
    if (hubReplies.getStore()) return work();
    if (!messageId) return work();
    const indicate = async () => {
      try {
        await WhatsAppCloudApiService.sendTypingIndicator(messageId);
      } catch {
        // Feedback is best-effort: an unavailable indicator must not block the answer.
        logger.warn('WhatsApp typing indicator unavailable');
      }
    };
    await indicate();
    let inFlight: Promise<void> | null = null;
    const timer = setInterval(() => {
      if (!inFlight) inFlight = indicate().finally(() => { inFlight = null; });
    }, 20000);
    timer.unref();
    try {
      return await work();
    } finally {
      clearInterval(timer);
      await inFlight;
    }
  }

  private static async processButtonDecision(params: {
    buttonId: string;
    sessionId: number;
    userId: number;
    companyId: number;
    role: Role;
  }): Promise<{ message: string; pendingAction?: PendingAction | null }> {
    const button = parsePendingActionButton(params.buttonId);
    const invalid = { message: 'Este botão não está mais válido. Peça o resumo atualizado do rascunho para confirmar ou cancelar.' };
    if (!button) return invalid;
    const record = await prisma.assistantPendingAction.findFirst({
      where: {
        id: button.pendingActionId,
        sessionId: params.sessionId,
        userId: params.userId,
        companyId: params.companyId,
        type: 'CREATE_TRANSACTION_DRAFT',
        status: 'PENDING',
        updatedAt: new Date(button.revision)
      }
    });
    if (!record) return invalid;

    const decisionParams = {
      pendingActionId: record.id,
      sessionId: params.sessionId,
      userId: params.userId,
      companyId: params.companyId,
      expectedUpdatedAt: new Date(button.revision),
      role: params.role
    };
    let action: PendingAction;
    try {
      action = button.decision === 'confirm'
        ? (await PendingActionService.confirmTransactionDraft(decisionParams)).pendingAction
        : await PendingActionService.cancelPendingAction(decisionParams);
    } catch (error) {
      logger.warn('WhatsApp pending action decision rejected', {
        pendingActionId: record.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return { message: 'Não foi possível concluir esta ação. Consulte o rascunho atualizado antes de tentar novamente.' };
    }

    const message = button.decision === 'confirm'
      ? `Lançamento confirmado.\n\n${formatWhatsAppDraft(action.summary)}`
      : 'Rascunho cancelado. Nenhum lançamento foi gravado.';
    const context = { sessionId: params.sessionId, userId: params.userId, companyId: params.companyId };
    await AssistantMessageService.createMessage({
      ...context,
      role: AssistantMessageRole.USER,
      text: `${button.decision === 'confirm' ? 'Confirmar' : 'Cancelar'} rascunho #${record.id}`
    });
    await AssistantMessageService.createMessage({
      ...context,
      role: AssistantMessageRole.ASSISTANT,
      text: message,
      content: { pendingAction: action }
    });
    return { message, pendingAction: action };
  }

  private static async processBoundMessage(params: {
    binding: Awaited<ReturnType<typeof prisma.whatsAppUserBinding.findUniqueOrThrow>>;
    incomingMessageId?: string | null;
    interactiveReplyId?: string;
    audio?: { mediaId: string };
    text: string | null;
    waId: string;
  }) {
    if (!params.text && !params.audio && params.interactiveReplyId === undefined) {
      await this.sendOutboundMessage({
        bindingId: params.binding.id,
        companyId: params.binding.activeCompanyId,
        replyToMessageId: params.incomingMessageId,
        text: 'Envie uma mensagem de texto ou de voz para interagir com o Zenit no WhatsApp.',
        userId: params.binding.userId,
        waId: params.waId
      });
      return;
    }

    const userContext = await UserService.getUserCompanyContext(
      params.binding.userId,
      params.binding.activeCompanyId
    );

    if (!userContext) {
      await this.sendOutboundMessage({
        bindingId: params.binding.id,
        companyId: params.binding.activeCompanyId,
        replyToMessageId: params.incomingMessageId,
        text: 'Seu usuario nao possui mais acesso a empresa ativa deste canal. Ajuste o vinculo no perfil do Zenit.',
        userId: params.binding.userId,
        waId: params.waId
      });
      return;
    }

    const hasChannelAccess = await AppAccessService.hasEffectiveAccess(
      params.binding.userId,
      params.binding.activeCompanyId,
      AppKey.ZENIT_WHATSAPP
    );

    if (!hasChannelAccess) {
      await this.sendOutboundMessage({
        bindingId: params.binding.id,
        companyId: params.binding.activeCompanyId,
        replyToMessageId: params.incomingMessageId,
        text: 'O canal de WhatsApp nao esta habilitado para sua empresa ou usuario. Revise as configuracoes do Zenit.',
        userId: params.binding.userId,
        waId: params.waId
      });
      return;
    }

    const companyContext = await ensureBindingCompanyContext({
      bindingId: params.binding.id,
      companyId: params.binding.activeCompanyId,
      userId: params.binding.userId
    });

    const turnContext = {
      sessionId: companyContext.assistantSessionId,
      userId: params.binding.userId,
      companyId: params.binding.activeCompanyId,
      role: userContext.role
    };
    let audioTelemetry: { model: string; bytes: number; latencyMs: number } | undefined;
    const response = await this.withTypingIndicator(params.incomingMessageId, async () => {
      let text = params.text;
      if (params.audio) {
        try {
          const transcription = await WhatsAppAudioService.transcribe({
            companyId: params.binding.activeCompanyId,
            userId: params.binding.userId,
            role: userContext.role,
            mediaId: params.audio.mediaId
          });
          text = transcription.text;
          audioTelemetry = transcription.telemetry;
          if (params.incomingMessageId) {
            await prisma.whatsAppMessageLog.update({
              where: { whatsappMessageId: params.incomingMessageId },
              data: { text, status: 'transcribed' }
            });
          }
        } catch (error) {
          const code = error instanceof WhatsAppAudioError ? error.code : 'transcription_failed';
          logger.warn('WhatsApp audio could not be transcribed', { code });
          if (params.incomingMessageId) {
            await prisma.whatsAppMessageLog.update({
              where: { whatsappMessageId: params.incomingMessageId },
              data: { status: code, failedAt: new Date() }
            });
          }
          await this.sendOutboundMessage({
            bindingId: params.binding.id, companyId: params.binding.activeCompanyId,
            userId: params.binding.userId, waId: params.waId,
            replyToMessageId: params.incomingMessageId,
            text: error instanceof WhatsAppAudioError ? error.userMessage :
              'Não consegui processar este áudio agora. Envie um novo áudio ou escreva o pedido. Nenhum lançamento foi gravado a partir dele.'
          });
          return null;
        }
      }
      return params.interactiveReplyId !== undefined
        ? this.processButtonDecision({ ...turnContext, buttonId: params.interactiveReplyId })
        : AssistantOrchestratorService.processTurn({
            ...turnContext, message: text!, requireConfirmationButton: true, onEvent: () => undefined
          });
    });
    if (!response) return { audio: { outcome: 'failed' } };

    await prisma.whatsAppBindingCompanyContext.update({
      where: {
        unique_whatsapp_binding_company_context: {
          bindingId: params.binding.id,
          companyId: params.binding.activeCompanyId
        }
      },
      data: {
        lastMessageAt: new Date()
      }
    });

    const outboundContext = {
      assistantSessionId: companyContext.assistantSessionId,
      bindingId: params.binding.id,
      companyId: params.binding.activeCompanyId,
      replyToMessageId: params.incomingMessageId,
      userId: params.binding.userId,
      waId: params.waId
    };
    if (response.pendingAction?.status === 'PENDING') {
      const text = `Aguardando confirmação\n\n${formatWhatsAppDraft(response.pendingAction.summary)}\n\nDeseja gravar este lançamento?`;
      if (text.length <= 1024) {
        await this.sendOutboundMessage({ ...outboundContext, text, buttons: buildPendingActionButtons(response.pendingAction) });
      } else {
        for (const chunk of chunkMessage(text)) {
          await this.sendOutboundMessage({ ...outboundContext, text: chunk });
        }
        await this.sendOutboundMessage({
          ...outboundContext,
          text: 'Confirma o lançamento descrito acima?',
          buttons: buildPendingActionButtons(response.pendingAction)
        });
      }
    } else {
      for (const chunk of chunkMessage(response.message)) {
        await this.sendOutboundMessage({ ...outboundContext, text: chunk });
      }
    }
    const assistantTelemetry = 'telemetry' in response && typeof response.telemetry === 'object'
      ? response.telemetry : undefined;
    return audioTelemetry ? { ...assistantTelemetry, audio: audioTelemetry } : assistantTelemetry;
  }

  private static async processStatusUpdate(status: Record<string, any>) {
    const messageId = typeof status.id === 'string' ? status.id : null;
    const statusValue = typeof status.status === 'string' ? status.status : 'unknown';
    const waId = normalizeDigits(status.recipient_id) || 'unknown';

    if (!messageId) {
      return;
    }

    if (statusValue === 'failed') {
      logger.warn(`WhatsApp delivery failed ${JSON.stringify({
        messageId,
        errorCodes: Array.isArray(status.errors) ? status.errors.map((error: any) => error.code) : []
      })}`);
    }

    const timestampValue = status.timestamp ? Number(status.timestamp) * 1000 : Date.now();
    const timestamp = new Date(timestampValue);

    const existing = await prisma.whatsAppMessageLog.findUnique({
      where: { whatsappMessageId: messageId }
    });

    if (!existing) {
      await recordMessageLog({
        createdAt: timestamp,
        direction: WhatsAppMessageDirection.OUTBOUND,
        kind: WhatsAppMessageKind.STATUS,
        payload: status,
        phoneNumber: normalizePhoneNumber(status.recipient_id),
        status: statusValue,
        waId,
        whatsappMessageId: messageId
      });
      return;
    }

    await prisma.whatsAppMessageLog.update({
      where: { id: existing.id },
      data: {
        deliveredAt: statusValue === 'delivered' ? timestamp : existing.deliveredAt,
        failedAt: statusValue === 'failed' ? timestamp : existing.failedAt,
        kind:
          existing.kind === WhatsAppMessageKind.TEXT || existing.kind === WhatsAppMessageKind.INTERACTIVE
            ? existing.kind
            : WhatsAppMessageKind.STATUS,
        payload: status,
        readAt: statusValue === 'read' ? timestamp : existing.readAt,
        status: statusValue
      }
    });
  }

  static async processWebhookPayload(params: {
    rawBody?: Buffer;
    signatureHeader?: string | null;
    payload: Record<string, any>;
  }) {
    const payloadSummary = summarizeWebhookEnvelope(params.payload);
    const signatureOk = await this.verifyWebhookRequest(
      params.rawBody,
      params.signatureHeader || null
    );

    if (!signatureOk) {
      logger.warn(
        `WhatsApp webhook signature rejected ${JSON.stringify({
          ...payloadSummary,
          hasRawBody: Boolean(params.rawBody),
          hasSignatureHeader: Boolean(params.signatureHeader),
          rawBodyLength: params.rawBody?.length ?? 0
        })}`
      );
      throw new Error('Assinatura do webhook WhatsApp invalida.');
    }

    logger.debug(
      `WhatsApp webhook payload accepted ${JSON.stringify({
        ...payloadSummary,
        hasRawBody: Boolean(params.rawBody),
        hasSignatureHeader: Boolean(params.signatureHeader),
        rawBodyLength: params.rawBody?.length ?? 0
      })}`
    );

    await this.expirePendingChallenges();

    let inboundMessages = 0;
    let statusEvents = 0;

    const entries = Array.isArray(params.payload.entry) ? params.payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = (change?.value || {}) as WebhookValue;
        const contact = Array.isArray(value.contacts) ? value.contacts[0] : undefined;
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];

        for (const message of messages) {
          const startedAt = Date.now();
          let outcome = 'failed';
          let telemetry: unknown;
          let companyId: number | null = null;
          try {
            const waId = normalizeDigits(message?.from || contact?.wa_id);
            if (!waId) {
              outcome = 'invalid_sender';
              logger.warn(
                `WhatsApp inbound message skipped without waId ${JSON.stringify({
                  messageId: typeof message?.id === 'string' ? message.id : null,
                  messageType: String(message?.type || 'unknown')
                })}`
              );
              continue;
            }

            const text = extractInboundText(message);
            const incomingMessageId = typeof message?.id === 'string' ? message.id : null;
            if (message.type === 'audio' && !incomingMessageId) {
              outcome = 'invalid_audio_message';
              continue;
            }

            if (incomingMessageId) {
              const existingInbound = await prisma.whatsAppMessageLog.findUnique({
                where: { whatsappMessageId: incomingMessageId }
              });

              if (existingInbound) {
                outcome = 'duplicate';
                logger.debug(
                  `WhatsApp inbound duplicate ignored ${JSON.stringify({
                    messageId: incomingMessageId,
                    waId: maskWaId(waId)
                  })}`
                );
                continue;
              }
            }

            logger.debug(
              `WhatsApp inbound message received ${JSON.stringify({
                hasBindingCode: Boolean(extractBindingCode(text)),
                hasText: Boolean(text),
                messageId: incomingMessageId,
                messageType: String(message?.type || 'unknown'),
                textLength: text?.length ?? 0,
                waId: maskWaId(waId)
              })}`
            );

            const consumedChallenge = await this.consumeBindingChallenge({
              incomingMessageId,
              profileName: contact?.profile?.name || null,
              text,
              waId
            });

            let binding = await prisma.whatsAppUserBinding.findUnique({
              where: { waId }
            });
            companyId = binding?.activeCompanyId ?? null;

            let assistantSessionId: number | null = null;
            if (binding) {
              const companyContext = await prisma.whatsAppBindingCompanyContext.findUnique({
                where: {
                  unique_whatsapp_binding_company_context: {
                    bindingId: binding.id,
                    companyId: binding.activeCompanyId
                  }
                }
              });
              assistantSessionId = companyContext?.assistantSessionId || null;
            }

            try {
              await recordMessageLog({
              assistantSessionId,
              bindingId: binding?.id ?? null,
              companyId: binding?.activeCompanyId ?? null,
              direction: WhatsAppMessageDirection.INBOUND,
              kind: mapMessageKind(message),
              payload: message,
              phoneNumber: normalizePhoneNumber(waId),
              status: 'received',
              text,
              userId: binding?.userId ?? null,
              waId,
              whatsappMessageId: incomingMessageId
              });
            } catch (error) {
              if ((error as { code?: string })?.code === 'P2002' ||
                  (error instanceof Error && error.message === 'whatsapp_inbound_duplicate')) {
                outcome = 'duplicate';
                continue;
              }
              throw error;
            }

            logger.debug(
              `WhatsApp inbound message persisted ${JSON.stringify({
                assistantSessionId,
                bindingFound: Boolean(binding),
                companyId: binding?.activeCompanyId ?? null,
                consumedChallenge: consumedChallenge.consumed,
                messageId: incomingMessageId,
                userId: binding?.userId ?? null,
                waId: maskWaId(waId)
              })}`
            );

            if (consumedChallenge.consumed) {
              outcome = 'binding_processed';
              inboundMessages += 1;
              continue;
            }

            if (!binding) {
              logger.warn(
                `WhatsApp inbound message without binding ${JSON.stringify({
                  messageId: incomingMessageId,
                  waId: maskWaId(waId)
                })}`
              );
              await this.sendOutboundMessage({
                replyToMessageId: incomingMessageId,
                text: 'Seu numero ainda nao esta vinculado ao Zenit. Gere um QR Code no perfil do sistema para concluir a conexao.',
                waId
              });
              outcome = 'unbound';
              inboundMessages += 1;
              continue;
            }

            await prisma.whatsAppUserBinding.update({
              where: { id: binding.id },
              data: {
                displayName: contact?.profile?.name || binding.displayName,
                lastInboundAt: new Date()
              }
            });

            binding = await prisma.whatsAppUserBinding.findUniqueOrThrow({
              where: { id: binding.id }
            });

            logger.debug(
              `WhatsApp bound message processing started ${JSON.stringify({
                assistantSessionId,
                bindingId: binding.id,
                companyId: binding.activeCompanyId,
                messageId: incomingMessageId,
                userId: binding.userId,
                waId: maskWaId(waId)
              })}`
            );

            telemetry = await this.processBoundMessage({
              binding,
              incomingMessageId,
              ...(message.type === 'audio' ? { audio: { mediaId: String(message.audio?.id || '') } } : {}),
              interactiveReplyId: message.type === 'interactive'
                ? String(message.interactive?.button_reply?.id || '')
                : message.type === 'button' ? String(message.button?.payload || '') : undefined,
              text,
              waId
            });

            outcome = 'completed';
            inboundMessages += 1;
          } catch (error) {
            logger.error('Erro ao processar mensagem WhatsApp recebida:', error);
          } finally {
            if (outcome !== 'duplicate') {
              logger.info(`WhatsApp message completed ${JSON.stringify({
                messageId: message?.id || null, companyId, outcome,
                durationMs: Date.now() - startedAt, telemetry
              })}`);
            }
          }
        }

        for (const status of statuses) {
          try {
            await this.processStatusUpdate(status);
            statusEvents += 1;
          } catch (error) {
            logger.error('Erro ao processar status WhatsApp:', error);
          }
        }
      }
    }

    logger.debug(
      `WhatsApp webhook payload completed ${JSON.stringify({
        ...payloadSummary,
        inboundMessages,
        statusEvents
      })}`
    );

    return {
      accepted: true,
      inboundMessages,
      statusEvents
    };
  }
}
