import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import AssistantDefaultsService from '../services/assistant-defaults.service';
import { logAuditEvent } from '../utils/audit-logger';
import { assistantDefaultsSchema } from '../validators/openai-integration.validator';

const router = Router();

router.use((req, res, next) => {
  if (req.user?.platformAdmin) return next();
  return res.status(403).json({ error: 'Acesso exclusivo aos administradores da plataforma Zenit.' });
});

router.get('/', async (_req, res, next) => {
  try {
    res.json(await AssistantDefaultsService.getGlobal());
  } catch (error) { next(error); }
});

router.put('/', validate(assistantDefaultsSchema, { source: 'body' }), async (req, res, next) => {
  try {
    const saved = await AssistantDefaultsService.updateGlobal(req.body);
    logAuditEvent('assistant.defaults_updated', { actorUserId: req.user.userId, ...saved });
    res.json(saved);
  } catch (error) { next(error); }
});

export default router;
