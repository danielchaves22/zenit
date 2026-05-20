import { Router } from 'express';
import {
  getPersonalWorkspace,
  selectCashCompany
} from '../controllers/personal-workspace.controller';
import { validate } from '../middlewares/validate.middleware';
import { selectCashCompanySchema } from '../validators/cash-bootstrap.validator';

const router = Router();

router.get('/personal-workspace', getPersonalWorkspace);
router.post('/bootstrap/select-company', validate(selectCashCompanySchema), selectCashCompany);

export default router;
