import type { AssistantReasoningEffort } from '@prisma/client';
import { getOpenAiReasoningEffort } from '../constants/openai';
import prisma from '../lib/prisma';

export type { AssistantReasoningEffort };
export type AssistantDefaults = { model: string; reasoningEffort: AssistantReasoningEffort | null };

const singleton = { id: 1 };
const fields = { model: true, reasoningEffort: true } as const;

export default class AssistantDefaultsService {
  static async getGlobal(): Promise<AssistantDefaults> {
    return prisma.assistantDefaults.findUniqueOrThrow({ where: singleton, select: fields });
  }

  static async updateGlobal(settings: AssistantDefaults): Promise<AssistantDefaults> {
    return prisma.assistantDefaults.update({ where: singleton, data: settings, select: fields });
  }

  static async resolveForCompany(assistantModelOverride: string | null | undefined): Promise<AssistantDefaults> {
    if (!assistantModelOverride) return this.getGlobal();
    return { model: assistantModelOverride, reasoningEffort: getOpenAiReasoningEffort(assistantModelOverride) ?? null };
  }
}
