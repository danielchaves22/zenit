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
import { userCreationWithPermissionsSchema } from '../validators/user-account-access.validator';

// ✅ IMPORTAR ROTAS DE PERMISSÃO
import userAccountAccessRoutes from './user-account-access.routes';

const router = Router();

router.post(
  '/',
  validate(userCreationWithPermissionsSchema), // ✅ NOVO VALIDATOR COM PERMISSÕES
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

// ✅ ADICIONAR ROTAS DE PERMISSÃO DE CONTA
router.use('/', userAccountAccessRoutes);

export default router;