import { z } from 'zod';

export const createAssistantSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional()
});

export const assistantSessionParamsSchema = z.object({
  sessionId: z.coerce.number().int().positive()
});

export const assistantPendingActionParamsSchema = z.object({
  pendingActionId: z.coerce.number().int().positive()
});

export const assistantMessageStreamSchema = z.object({
  message: z.string().trim().min(1).max(1000)
});

export type CreateAssistantSessionInput = z.infer<typeof createAssistantSessionSchema>;
export type AssistantSessionParams = z.infer<typeof assistantSessionParamsSchema>;
export type AssistantPendingActionParams = z.infer<typeof assistantPendingActionParamsSchema>;
export type AssistantMessageStreamInput = z.infer<typeof assistantMessageStreamSchema>;
