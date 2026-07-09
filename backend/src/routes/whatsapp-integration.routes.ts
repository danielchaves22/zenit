import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  createWhatsAppBindingChallenge,
  disconnectWhatsAppBinding,
  getWhatsAppIntegrationStatus,
  updateWhatsAppActiveCompany
} from '../controllers/whatsapp-integration.controller';
import {
  createWhatsAppBindingChallengeSchema,
  updateWhatsAppActiveCompanySchema
} from '../validators/whatsapp-integration.validator';

const router = Router();

router.get('/status', getWhatsAppIntegrationStatus);
router.post(
  '/challenge',
  validate(createWhatsAppBindingChallengeSchema),
  createWhatsAppBindingChallenge
);
router.put(
  '/active-company',
  validate(updateWhatsAppActiveCompanySchema),
  updateWhatsAppActiveCompany
);
router.post('/disconnect', disconnectWhatsAppBinding);

export default router;
