import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  disconnectGmail,
  getGmailIntegrationStatus,
  startGmailOAuth,
  syncGmailNow,
  updateGmailIngestionConfig
} from '../controllers/gmail-integration.controller';
import { updateGmailIngestionConfigSchema } from '../validators/gmail-integration.validator';

const router = Router();

router.get('/status', getGmailIntegrationStatus);
router.post('/oauth/start', startGmailOAuth);
router.put('/config', validate(updateGmailIngestionConfigSchema), updateGmailIngestionConfig);
router.post('/sync-now', syncGmailNow);
router.post('/disconnect', disconnectGmail);

export default router;

