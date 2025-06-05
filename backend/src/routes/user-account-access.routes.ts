// backend/src/routes/user-account-access.routes.ts
import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { requirePermissionManagement } from '../middlewares/financial-access.middleware';
import {
  getUserAccountAccess,
  grantAccountAccess,
  grantAllAccountAccess,
  revokeAccountAccess,
  revokeAllAccountAccess,
  bulkUpdateAccountAccess
} from '../controllers/user-financial-account-access.controller';
import {
  grantAccountAccessSchema,
  revokeAccountAccessSchema,
  bulkUpdateAccountAccessSchema
} from '../validators/user-account-access.validator';

const router = Router();

// Todas as rotas requerem permissão de gerenciamento (ADMIN ou SUPERUSER)
router.use(requirePermissionManagement());

/**
 * @swagger
 * /api/users/{userId}/account-access:
 *   get:
 *     summary: Obtém resumo dos acessos de um usuário
 *     tags: [User Account Access]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     responses:
 *       200:
 *         description: Resumo de acessos obtido com sucesso
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Usuário não encontrado
 */
router.get('/:userId/account-access', getUserAccountAccess);

/**
 * @swagger
 * /api/users/{userId}/account-access/grant:
 *   post:
 *     summary: Concede acesso a contas específicas
 *     tags: [User Account Access]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountIds
 *             properties:
 *               accountIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: IDs das contas para conceder acesso
 *     responses:
 *       200:
 *         description: Acesso concedido com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/:userId/account-access/grant', validate(grantAccountAccessSchema), grantAccountAccess);

/**
 * @swagger
 * /api/users/{userId}/account-access/grant-all:
 *   post:
 *     summary: Concede acesso a todas as contas da empresa
 *     tags: [User Account Access]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Acesso total concedido com sucesso
 */
router.post('/:userId/account-access/grant-all', grantAllAccountAccess);

/**
 * @swagger
 * /api/users/{userId}/account-access/revoke:
 *   delete:
 *     summary: Revoga acesso a contas específicas
 *     tags: [User Account Access]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountIds
 *             properties:
 *               accountIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: IDs das contas para revogar acesso
 *     responses:
 *       200:
 *         description: Acesso revogado com sucesso
 */
router.delete('/:userId/account-access/revoke', validate(revokeAccountAccessSchema), revokeAccountAccess);

/**
 * @swagger
 * /api/users/{userId}/account-access/revoke-all:
 *   delete:
 *     summary: Revoga todos os acessos do usuário
 *     tags: [User Account Access]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Todos os acessos revogados com sucesso
 */
router.delete('/:userId/account-access/revoke-all', revokeAllAccountAccess);

/**
 * @swagger
 * /api/users/{userId}/account-access/bulk-update:
 *   post:
 *     summary: Atualiza todos os acessos do usuário (substitui existentes)
 *     tags: [User Account Access]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountIds
 *             properties:
 *               accountIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: IDs das contas para o usuário ter acesso (substitui todos os existentes)
 *     responses:
 *       200:
 *         description: Acessos atualizados com sucesso
 */
router.post('/:userId/account-access/bulk-update', validate(bulkUpdateAccountAccessSchema), bulkUpdateAccountAccess);

export default router;