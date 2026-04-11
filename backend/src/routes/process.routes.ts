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
  createProcessSchema,
  listProcessesSchema,
  updateProcessSchema,
  updateProcessStatusSchema
} from '../validators/process.validator';

const router = Router();

router.post('/', validate(createProcessSchema), createProcess);
router.get('/', validate(listProcessesSchema), listProcesses);
router.get('/:id/status-history', getProcessStatusHistory);
router.post('/:id/tags/:tagId', addProcessTag);
router.delete('/:id/tags/:tagId', removeProcessTag);
router.get('/:id', getProcessById);
router.put('/:id', validate(updateProcessSchema), updateProcess);
router.patch('/:id/status', validate(updateProcessStatusSchema), updateProcessStatus);
router.delete('/:id', deleteProcess);

export default router;

