import { z } from 'zod';

export const assistantModeSchema = z.enum(['OPERATOR', 'SPECIALIST']);
export const assistantSessionStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const assistantTurnStatusSchema = z.enum(['STARTED', 'COMPLETED', 'FAILED']);
export const assistantMessageRoleSchema = z.enum(['USER', 'ASSISTANT', 'TOOL']);
export const assistantPendingActionTypeSchema = z.enum(['CREATE_TRANSACTION_DRAFT']);
export const assistantPendingActionStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'CANCELED',
  'FAILED',
  'EXPIRED'
]);
export const assistantActionKindSchema = z.enum([
  'confirm_pending_action',
  'cancel_pending_action',
  'reply'
]);
export const assistantCardKindSchema = z.enum(['text', 'draft_transaction']);
export const assistantStreamEventTypeSchema = z.enum([
  'turn.started',
  'message.delta',
  'message.completed',
  'pending_action.created',
  'turn.completed',
  'turn.error'
]);

export type AssistantMode = z.infer<typeof assistantModeSchema>;
export type AssistantSessionStatus = z.infer<typeof assistantSessionStatusSchema>;
export type AssistantTurnStatus = z.infer<typeof assistantTurnStatusSchema>;
export type AssistantMessageRole = z.infer<typeof assistantMessageRoleSchema>;
export type AssistantPendingActionType = z.infer<typeof assistantPendingActionTypeSchema>;
export type AssistantPendingActionStatus = z.infer<typeof assistantPendingActionStatusSchema>;
export type AssistantActionKind = z.infer<typeof assistantActionKindSchema>;
export type AssistantCardKind = z.infer<typeof assistantCardKindSchema>;
export type AssistantStreamEventType = z.infer<typeof assistantStreamEventTypeSchema>;
