import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { getPreferences, updateColorScheme } from '../controllers/user-preference.controller';
import { updateColorSchemeSchema } from '../validators/user-preference.validator';

const router = Router();

router.get('/', getPreferences);
router.put('/color-scheme', validate(updateColorSchemeSchema), updateColorScheme);

export default router;
