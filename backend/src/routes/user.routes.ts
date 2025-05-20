import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { tenantMiddleware } from '../middlewares/tenant.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser
} from '../controllers/user.controller';
import {
  createUserSchema,
  updateUserSchema
} from '../validators/user.validator';

const router = Router();

router.post(
  '/',
  validate(createUserSchema),
  authorize('create', 'user'),
  createUser
);
router.get('/', authorize('read', 'user'), getUsers);
router.get('/:id', authorize('read', 'user'), getUserById);
router.put(
  '/:id',
  validate(updateUserSchema),
  authorize('update', 'user'),
  updateUser
);
router.delete('/:id', authorize('delete', 'user'), deleteUser);

export default router;
