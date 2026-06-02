import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { getPreferences, updateColorScheme } from '../controllers/user-preference.controller';
import { updateColorSchemeSchema } from '../validators/user-preference.validator';
import {
  createSavedFilterPreset,
  deleteSavedFilterPreset,
  listSavedFilterPresets,
  markLastUsedFilterPreset
} from '../controllers/saved-filter-preset.controller';
import {
  createSavedFilterPresetSchema,
  listSavedFilterPresetsSchema,
  savedFilterPresetIdParamsSchema
} from '../validators/saved-filter-preset.validator';

const router = Router();

router.get('/', getPreferences);
router.put('/color-scheme', validate(updateColorSchemeSchema), updateColorScheme);
router.get(
  '/filter-presets',
  validate(listSavedFilterPresetsSchema, { source: 'query' }),
  listSavedFilterPresets
);
router.post('/filter-presets', validate(createSavedFilterPresetSchema), createSavedFilterPreset);
router.put(
  '/filter-presets/:id/last-used',
  validate(savedFilterPresetIdParamsSchema, { source: 'params' }),
  markLastUsedFilterPreset
);
router.delete(
  '/filter-presets/:id',
  validate(savedFilterPresetIdParamsSchema, { source: 'params' }),
  deleteSavedFilterPreset
);

export default router;
