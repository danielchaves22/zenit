import { z } from 'zod';
import {
  assistantActionKindSchema,
  assistantCardKindSchema,
  assistantModeSchema,
  assistantPendingActionStatusSchema,
  assistantPendingActionTypeSchema,
  assistantStreamEventTypeSchema
} from './enums';

export const assistantAccountRefSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1)
});

export const assistantCategoryRefSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1)
});

export const draftTransactionSummarySchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED']).default('COMPLETED'),
  date: z.string().min(1),
  dueDate: z.string().min(1).nullable().optional(),
  effectiveDate: z.string().min(1).nullable().optional(),
  notes: z.string().nullable().optional(),
  installmentCount: z.number().int().min(1).max(120).optional(),
  fromAccount: assistantAccountRefSchema.nullable().optional(),
  toAccount: assistantAccountRefSchema.nullable().optional(),
  category: assistantCategoryRefSchema.nullable().optional()
});

export const pendingActionSchema = z.object({
  id: z.number().int().positive(),
  type: assistantPendingActionTypeSchema,
  status: assistantPendingActionStatusSchema,
  summary: draftTransactionSummarySchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const assistantActionSchema = z.object({
  id: z.string().min(1),
  kind: assistantActionKindSchema,
  label: z.string().min(1),
  pendingActionId: z.number().int().positive().optional()
});

export const assistantCardSchema = z.object({
  id: z.string().min(1),
  kind: assistantCardKindSchema,
  title: z.string().min(1),
  body: z.string().optional(),
  draft: draftTransactionSummarySchema.optional()
});

export const assistantTelemetrySchema = z.object({
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  latencyMs: z.number().int().min(0),
  toolCalls: z.number().int().min(0),
  usedFallbackModel: z.boolean().optional()
});

export const assistantTurnResponseSchema = z.object({
  sessionId: z.number().int().positive(),
  assistantTurnId: z.number().int().positive(),
  mode: assistantModeSchema,
  message: z.string().min(1),
  cards: z.array(assistantCardSchema).default([]),
  actions: z.array(assistantActionSchema).default([]),
  pendingAction: pendingActionSchema.nullable().optional(),
  telemetry: assistantTelemetrySchema.optional()
});

export const assistantHistoryMessageSchema = z.object({
  id: z.number().int().positive(),
  turnId: z.number().int().positive().nullable().optional(),
  role: z.enum(['USER', 'ASSISTANT', 'TOOL']),
  text: z.string().min(1),
  mode: assistantModeSchema.nullable().optional(),
  createdAt: z.string().min(1),
  pendingAction: pendingActionSchema.nullable().optional()
});

export const assistantSessionHistorySchema = z.object({
  sessionId: z.number().int().positive(),
  messages: z.array(assistantHistoryMessageSchema)
});

export const userChatMessageSchema = z.object({
  message: z.string().trim().min(1).max(1000)
});

export const assistantStreamEventSchema = z.object({
  type: assistantStreamEventTypeSchema,
  sessionId: z.number().int().positive(),
  assistantTurnId: z.number().int().positive().optional(),
  delta: z.string().optional(),
  response: assistantTurnResponseSchema.optional(),
  pendingAction: pendingActionSchema.optional(),
  error: z.string().optional()
});

export type AssistantAccountRef = z.infer<typeof assistantAccountRefSchema>;
export type AssistantCategoryRef = z.infer<typeof assistantCategoryRefSchema>;
export type DraftTransactionSummary = z.infer<typeof draftTransactionSummarySchema>;
export type PendingAction = z.infer<typeof pendingActionSchema>;
export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type AssistantCard = z.infer<typeof assistantCardSchema>;
export type AssistantTelemetry = z.infer<typeof assistantTelemetrySchema>;
export type AssistantTurnResponse = z.infer<typeof assistantTurnResponseSchema>;
export type AssistantHistoryMessage = z.infer<typeof assistantHistoryMessageSchema>;
export type AssistantSessionHistory = z.infer<typeof assistantSessionHistorySchema>;
export type UserChatMessage = z.infer<typeof userChatMessageSchema>;
export type AssistantStreamEvent = z.infer<typeof assistantStreamEventSchema>;
