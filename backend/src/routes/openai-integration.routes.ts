import { Router } from 'express';
import {
  getOpenAiIntegrationStatus,
  testOpenAiCredential,
  upsertOpenAiByok
} from '../controllers/openai-integration.controller';

const router = Router();

router.get('/status', getOpenAiIntegrationStatus);
router.put('/byok', upsertOpenAiByok);
router.post('/test', testOpenAiCredential);

export default router;
