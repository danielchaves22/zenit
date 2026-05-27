import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  exportFinancialAccountMovementSchema,
  financialAccountMovementReportSchema
} from '../validators/financial-account-movement-report.validator';
import {
  exportFinancialAccountMovementToExcel,
  exportFinancialAccountMovementToPDF,
  getFinancialAccountMovementReport
} from '../controllers/financial-account-movement-report.controller';

const router = Router();

/**
 * @swagger
 * /api/financial/reports/financial-account-movement:
 *   get:
 *     summary: Gera relatÃ³rio de movimentaÃ§Ã£o de contas financeiras
 *     tags: [Financial Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Data inicial do perÃ­odo
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Data final do perÃ­odo
 *       - in: query
 *         name: financialAccountIds
 *         required: true
 *         schema:
 *           type: string
 *         description: IDs das contas financeiras separados por vÃ­rgula
 *       - in: query
 *         name: groupBy
 *         required: false
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Forma de agrupamento dos dados
 *     responses:
 *       200:
 *         description: RelatÃ³rio gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   period:
 *                     type: string
 *                   periodLabel:
 *                     type: string
 *                   income:
 *                     type: number
 *                   expense:
 *                     type: number
 *                   balance:
 *                     type: number
 *                   transactions:
 *                     type: array
 *                     items:
 *                       type: object
 *       400:
 *         description: ParÃ¢metros invÃ¡lidos
 *       401:
 *         description: NÃ£o autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', validate(financialAccountMovementReportSchema), getFinancialAccountMovementReport);

/**
 * @swagger
 * /api/financial/reports/financial-account-movement/pdf:
 *   post:
 *     summary: Exporta relatÃ³rio textual estruturado pelo endpoint legado de PDF
 *     tags: [Financial Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *               - financialAccountIds
 *               - data
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               financialAccountIds:
 *                 type: array
 *                 items:
 *                   type: number
 *               groupBy:
 *                 type: string
 *                 enum: [day, week, month]
 *                 default: day
 *               data:
 *                 type: array
 *                 description: Dados do relatÃ³rio jÃ¡ processados
 *     responses:
 *       200:
 *         description: Arquivo TXT gerado com sucesso
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Dados insuficientes
 *       401:
 *         description: NÃ£o autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/pdf', validate(exportFinancialAccountMovementSchema, { source: 'body' }), exportFinancialAccountMovementToPDF);

/**
 * @swagger
 * /api/financial/reports/financial-account-movement/excel:
 *   post:
 *     summary: Exporta relatÃ³rio CSV compatÃ­vel com Excel
 *     tags: [Financial Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *               - financialAccountIds
 *               - data
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               financialAccountIds:
 *                 type: array
 *                 items:
 *                   type: number
 *               groupBy:
 *                 type: string
 *                 enum: [day, week, month]
 *                 default: day
 *               data:
 *                 type: array
 *                 description: Dados do relatÃ³rio jÃ¡ processados
 *     responses:
 *       200:
 *         description: CSV gerado com sucesso
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Dados insuficientes
 *       401:
 *         description: NÃ£o autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/excel', validate(exportFinancialAccountMovementSchema, { source: 'body' }), exportFinancialAccountMovementToExcel);

export default router;
