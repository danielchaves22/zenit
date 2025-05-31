// backend/src/routes/financial-account-movement-report.routes.ts
import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { 
  financialAccountMovementReportSchema,
  exportFinancialAccountMovementSchema
} from '../validators/financial-account-movement-report.validator';
import { 
  getFinancialAccountMovementReport,
  exportFinancialAccountMovementToPDF,
  exportFinancialAccountMovementToExcel
} from '../controllers/financial-account-movement-report.controller';

const router = Router();

/**
 * @swagger
 * /api/financial/reports/financial-account-movement:
 *   get:
 *     summary: Gera relatório de movimentação de contas financeiras
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
 *         description: Data inicial do período
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Data final do período
 *       - in: query
 *         name: financialAccountIds
 *         required: true
 *         schema:
 *           type: string
 *         description: IDs das contas financeiras separados por vírgula
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
 *         description: Relatório gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   period:
 *                     type: string
 *                     description: Chave do período
 *                   periodLabel:
 *                     type: string
 *                     description: Label formatado do período
 *                   income:
 *                     type: number
 *                     description: Total de entradas no período
 *                   expense:
 *                     type: number
 *                     description: Total de saídas no período
 *                   balance:
 *                     type: number
 *                     description: Saldo do período (entradas - saídas)
 *                   transactions:
 *                     type: array
 *                     description: Lista de transações do período
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         description:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         date:
 *                           type: string
 *                           format: date-time
 *                         type:
 *                           type: string
 *                           enum: [INCOME, EXPENSE]
 *                         financialAccount:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: number
 *                             name:
 *                               type: string
 *                         category:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: number
 *                             name:
 *                               type: string
 *                             color:
 *                               type: string
 *       400:
 *         description: Parâmetros inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', validate(financialAccountMovementReportSchema), getFinancialAccountMovementReport);

/**
 * @swagger
 * /api/financial/reports/financial-account-movement/pdf:
 *   post:
 *     summary: Exporta relatório de movimentação em PDF
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
 *                 description: Dados do relatório já processados
 *     responses:
 *       200:
 *         description: PDF gerado com sucesso
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Dados insuficientes
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/pdf', validate(exportFinancialAccountMovementSchema), exportFinancialAccountMovementToPDF);

/**
 * @swagger
 * /api/financial/reports/financial-account-movement/excel:
 *   post:
 *     summary: Exporta relatório de movimentação em Excel
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
 *                 description: Dados do relatório já processados
 *     responses:
 *       200:
 *         description: Excel gerado com sucesso
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Dados insuficientes
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/excel', validate(exportFinancialAccountMovementSchema), exportFinancialAccountMovementToExcel);

export default router;