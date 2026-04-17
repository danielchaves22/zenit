import { Router } from 'express';
import { gmailOAuthCallback } from '../controllers/gmail-integration.controller';
import { gmailWebhook } from '../controllers/gmail-webhook.controller';

const router = Router();

router.get('/integrations/gmail/oauth/callback', gmailOAuthCallback);
router.post('/webhooks/gmail', gmailWebhook);

export default router;

