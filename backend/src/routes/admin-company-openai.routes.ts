import { Router } from 'express';
import {
  getAdminCompanyOpenAiStatus,
  testAdminCompanyOpenAi,
  upsertAdminCompanyOpenAi
} from '../controllers/admin-company-openai.controller';
import { validate } from '../middlewares/validate.middleware';
import {
  testOpenAiCredentialSchema,
  upsertOpenAiByokSchema
} from '../validators/openai-integration.validator';

const router = Router();

router.get('/:companyId/openai', getAdminCompanyOpenAiStatus);
router.put('/:companyId/openai', validate(upsertOpenAiByokSchema), upsertAdminCompanyOpenAi);
router.post('/:companyId/openai/test', validate(testOpenAiCredentialSchema), testAdminCompanyOpenAi);

export default router;
