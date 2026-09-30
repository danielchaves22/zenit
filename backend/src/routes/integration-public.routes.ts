import { Router } from 'express';
import { gmailOAuthCallback } from '../controllers/gmail-integration.controller';
import { gmailWebhook } from '../controllers/gmail-webhook.controller';
import hubBridgeRoutes from './hub-bridge.routes';
import {
  receiveWhatsAppWebhook,
  verifyWhatsAppWebhook
} from '../controllers/whatsapp-webhook.controller';

const router = Router();
router.use(hubBridgeRoutes);

router.get('/integrations/gmail/oauth/callback', gmailOAuthCallback);
router.post('/webhooks/gmail', gmailWebhook);
router.get('/webhooks/whatsapp', verifyWhatsAppWebhook);
router.post('/webhooks/whatsapp', receiveWhatsAppWebhook);

export default router;

