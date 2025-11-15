import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { getPreferences, updateColorScheme, updatePreferences } from '../controllers/user-preference.controller';
import { updateColorSchemeSchema, updatePreferencesSchema } from '../validators/user-preference.validator';

const router = Router();

router.get('/', getPreferences);
router.put('/color-scheme', validate(updateColorSchemeSchema), updateColorScheme);
router.put('/', validate(updatePreferencesSchema), updatePreferences);

export default router;
