import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  addProcessTag,
  createProcess,
  deleteProcess,
  getProcessById,
  getProcessStatusHistory,
  listProcesses,
  removeProcessTag,
  updateProcess,
  updateProcessStatus
} from '../controllers/process.controller';
import {
  createInitialCalculation as createInitialCalculationHandler,
  createInitialCalculationVersion as createInitialCalculationVersionHandler,
  createProcessCustomVerba as createProcessCustomVerbaHandler,
  deleteProcessCustomVerba as deleteProcessCustomVerbaHandler,
  getInitialCalculation as getInitialCalculationHandler,
  getInitialCalculationCatalog as getInitialCalculationCatalogHandler,
  listInitialCalculationVersions as listInitialCalculationVersionsHandler,
  listProcessCustomVerbas as listProcessCustomVerbasHandler,
  publishInitialCalculationVersion as publishInitialCalculationVersionHandler,
  updateProcessCustomVerba as updateProcessCustomVerbaHandler
} from '../controllers/initial-calculation.controller';
import {
  createProcessSchema,
  listProcessesSchema,
  updateProcessSchema,
  updateProcessStatusSchema
} from '../validators/process.validator';
import {
  createInitialCalculationVersionWithCalculationSchema as createInitialCalculationVersionWithCalculationHandlerSchema,
  createProcessCustomVerbaSchema as createProcessCustomVerbaHandlerSchema,
  initialCalculationProcessSchema as initialCalculationProcessHandlerSchema,
  initialCalculationVersionSchema as initialCalculationVersionHandlerSchema,
  listInitialCalculationVersionsSchema as listInitialCalculationVersionsHandlerSchema,
  processCustomVerbaParamsSchema as processCustomVerbaParamsHandlerSchema,
  publishInitialCalculationVersionSchema as publishInitialCalculationVersionHandlerSchema,
  updateProcessCustomVerbaSchema as updateProcessCustomVerbaHandlerSchema
} from '../validators/initial-calculation.validator';

const router = Router();

router.post('/', validate(createProcessSchema), createProcess);
router.get('/', validate(listProcessesSchema), listProcesses);
router.get('/:id/initial-calculation', validate(initialCalculationProcessHandlerSchema), getInitialCalculationHandler);
router.get('/:id/initial-calculation/catalog', validate(initialCalculationProcessHandlerSchema), getInitialCalculationCatalogHandler);
router.get('/:id/initial-calculation/verbas-do-processo', validate(initialCalculationProcessHandlerSchema), listProcessCustomVerbasHandler);
router.post('/:id/initial-calculation/verbas-do-processo', validate(createProcessCustomVerbaHandlerSchema), createProcessCustomVerbaHandler);
router.put('/:id/initial-calculation/verbas-do-processo/:verbaId', validate(updateProcessCustomVerbaHandlerSchema), updateProcessCustomVerbaHandler);
router.delete('/:id/initial-calculation/verbas-do-processo/:verbaId', validate(processCustomVerbaParamsHandlerSchema), deleteProcessCustomVerbaHandler);
router.post('/:id/initial-calculations', validate(initialCalculationVersionHandlerSchema), createInitialCalculationHandler);
router.get('/:id/initial-calculations/:calculationId/versions', validate(listInitialCalculationVersionsHandlerSchema), listInitialCalculationVersionsHandler);
router.post('/:id/initial-calculations/:calculationId/versions', validate(createInitialCalculationVersionWithCalculationHandlerSchema), createInitialCalculationVersionHandler);
router.patch(
  '/:id/initial-calculations/:calculationId/versions/:versionId/publish',
  validate(publishInitialCalculationVersionHandlerSchema),
  publishInitialCalculationVersionHandler
);
router.get('/:id/status-history', getProcessStatusHistory);
router.post('/:id/tags/:tagId', addProcessTag);
router.delete('/:id/tags/:tagId', removeProcessTag);
router.get('/:id', getProcessById);
router.put('/:id', validate(updateProcessSchema), updateProcess);
router.patch('/:id/status', validate(updateProcessStatusSchema), updateProcessStatus);
router.delete('/:id', deleteProcess);

export default router;
