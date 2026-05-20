import { Router } from 'express';
import { getPersonalWorkspace } from '../controllers/personal-workspace.controller';

const router = Router();

router.get('/personal-workspace', getPersonalWorkspace);

export default router;
