import { Request, Response } from 'express';
import FinancialAccountMovementReportService from '../services/financial-account-movement-report.service';
import {
  ExportFinancialAccountMovementData,
  FinancialAccountMovementReportQuery
} from '../validators/financial-account-movement-report.validator';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number } {
  const { companyId, userId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return { companyId, userId };
}

export async function getFinancialAccountMovementReport(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      startDate,
      endDate,
      financialAccountIds,
      groupBy = 'day'
    } = req.query as unknown as FinancialAccountMovementReportQuery;

    if (!financialAccountIds) {
      return res.status(400).json({
        error: 'financialAccountIds e obrigatorio'
      });
    }

    const accountIds = financialAccountIds
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));

    if (accountIds.length === 0) {
      return res.status(400).json({
        error: 'Pelo menos uma conta financeira deve ser selecionada'
      });
    }

    const reportData = await FinancialAccountMovementReportService.generateReport({
      companyId,
      startDate,
      endDate,
      financialAccountIds: accountIds,
      groupBy
    });

    logger.info('Financial account movement report generated', {
      companyId,
      startDate,
      endDate,
      accountIds: accountIds.length,
      groupBy,
      periodsGenerated: reportData.length
    });

    return res.status(200).json(reportData);
  } catch (error: any) {
    logger.error('Error generating financial account movement report', {
      error: error.message,
      stack: error.stack,
      query: req.query
    });

    return res.status(500).json({
      error: 'Erro ao gerar relatorio de movimentacao'
    });
  }
}

export async function exportFinancialAccountMovementToPDF(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      startDate,
      endDate,
      financialAccountIds,
      groupBy = 'day',
      data
    } = req.body as ExportFinancialAccountMovementData;

    const textBuffer = await FinancialAccountMovementReportService.generatePDF({
      companyId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      financialAccountIds,
      groupBy,
      data
    });

    const filename = `relatorio-movimentacao-contas-${startDate}-${endDate}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', textBuffer.length);
    res.setHeader('X-Generated-Format', 'txt');

    logger.info('Financial account movement text export generated from pdf endpoint', {
      companyId,
      startDate,
      endDate,
      filename,
      size: textBuffer.length
    });

    return res.send(textBuffer);
  } catch (error: any) {
    logger.error('Error exporting financial account movement to text from pdf endpoint', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Erro ao gerar exportacao textual do relatorio'
    });
  }
}

export async function exportFinancialAccountMovementToExcel(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const {
      startDate,
      endDate,
      financialAccountIds,
      groupBy = 'day',
      data
    } = req.body as ExportFinancialAccountMovementData;

    const csvBuffer = await FinancialAccountMovementReportService.generateExcel({
      companyId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      financialAccountIds,
      groupBy,
      data
    });

    const filename = `relatorio-movimentacao-contas-${startDate}-${endDate}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', csvBuffer.length);
    res.setHeader('X-Generated-Format', 'csv');

    logger.info('Financial account movement csv export generated from excel endpoint', {
      companyId,
      startDate,
      endDate,
      filename,
      size: csvBuffer.length
    });

    return res.send(csvBuffer);
  } catch (error: any) {
    logger.error('Error exporting financial account movement to csv from excel endpoint', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Erro ao gerar CSV do relatorio'
    });
  }
}
