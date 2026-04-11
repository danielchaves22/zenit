import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { createProcessTag, listProcessTags } from '../controllers/process-tag.controller';
import { createProcessTagSchema, listProcessTagsSchema } from '../validators/process-tag.validator';

const router = Router();

router.post('/', validate(createProcessTagSchema), createProcessTag);
router.get('/', validate(listProcessTagsSchema), listProcessTags);

export default router;

