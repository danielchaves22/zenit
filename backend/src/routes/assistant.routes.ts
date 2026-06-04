import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  cancelAssistantPendingAction,
  confirmAssistantPendingAction,
  createAssistantSession,
  getAssistantSessionHistory,
  streamAssistantMessage
} from '../controllers/assistant.controller';
import {
  assistantMessageStreamSchema,
  assistantPendingActionParamsSchema,
  assistantSessionParamsSchema,
  createAssistantSessionSchema
} from '../validators/assistant.validator';

const router = Router();

router.post('/sessions', validate(createAssistantSessionSchema), createAssistantSession);
router.get(
  '/sessions/:sessionId/history',
  validate(assistantSessionParamsSchema, { source: 'params' }),
  getAssistantSessionHistory
);
router.post(
  '/sessions/:sessionId/messages/stream',
  validate(assistantSessionParamsSchema, { source: 'params' }),
  validate(assistantMessageStreamSchema, { source: 'body' }),
  streamAssistantMessage
);
router.post(
  '/pending-actions/:pendingActionId/confirm',
  validate(assistantPendingActionParamsSchema, { source: 'params' }),
  confirmAssistantPendingAction
);
router.post(
  '/pending-actions/:pendingActionId/cancel',
  validate(assistantPendingActionParamsSchema, { source: 'params' }),
  cancelAssistantPendingAction
);

export default router;
