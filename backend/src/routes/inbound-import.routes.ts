import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  createInboundImport,
  listInboundImports,
  updateInboundImportDestination
} from '../controllers/inbound-import.controller';
import {
  createInboundImportSchema,
  listInboundImportsSchema,
  updateInboundImportDestinationSchema
} from '../validators/inbound-import.validator';

const router = Router();

router.post('/', validate(createInboundImportSchema), createInboundImport);
router.get('/', validate(listInboundImportsSchema), listInboundImports);
router.patch('/:id/destination', validate(updateInboundImportDestinationSchema), updateInboundImportDestination);

export default router;

