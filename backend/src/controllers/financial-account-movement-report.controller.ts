// backend/src/controllers/financial-account-movement-report.controller.ts
import { Request, Response } from 'express';
import FinancialAccountMovementReportService from '../services/financial-account-movement-report.service';
import { logger } from '../utils/logger';

/**
 * Função helper simplificada: extrai o único companyId e userId do token
 */
function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - O middleware já validou a existência desses valores
  const { companyId, userId } = req.user;
  
  if (!companyId) {
    throw new Error('Contexto de empresa não encontrado');
  }
  
  return { companyId, userId };
}

/**
 * GET /api/financial/reports/financial-account-movement
 * Gera relatório de movimentação de contas financeiras
 */
export async function getFinancialAccountMovementReport(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { 
      startDate, 
      endDate, 
      financialAccountIds, 
      groupBy = 'day' 
    } = req.query;

    // Validações
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate e endDate são obrigatórios' 
      });
    }

    if (!financialAccountIds) {
      return res.status(400).json({ 
        error: 'financialAccountIds é obrigatório' 
      });
    }

    // Parse dos parâmetros
    const accountIds = (financialAccountIds as string)
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));

    if (accountIds.length === 0) {
      return res.status(400).json({ 
        error: 'Pelo menos uma conta financeira deve ser selecionada' 
      });
    }

    const validGroupBy = ['day', 'week', 'month'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ 
        error: 'groupBy deve ser: day, week ou month' 
      });
    }

    const reportData = await FinancialAccountMovementReportService.generateReport({
      companyId,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      financialAccountIds: accountIds,
      groupBy: groupBy as 'day' | 'week' | 'month'
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
      error: 'Erro ao gerar relatório de movimentação'
    });
  }
}

/**
 * POST /api/financial/reports/financial-account-movement/pdf
 * Exporta relatório em PDF
 */
export async function exportFinancialAccountMovementToPDF(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { 
      startDate, 
      endDate, 
      financialAccountIds, 
      groupBy = 'day',
      data 
    } = req.body;

    // Validações básicas
    if (!startDate || !endDate || !financialAccountIds || !data) {
      return res.status(400).json({ 
        error: 'Dados insuficientes para gerar PDF' 
      });
    }

    const pdfBuffer = await FinancialAccountMovementReportService.generatePDF({
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
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info('Financial account movement PDF exported', {
      companyId,
      startDate,
      endDate,
      filename,
      size: pdfBuffer.length
    });

    return res.send(pdfBuffer);

  } catch (error: any) {
    logger.error('Error exporting financial account movement to PDF', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: 'Erro ao gerar PDF do relatório'
    });
  }
}

/**
 * POST /api/financial/reports/financial-account-movement/excel
 * Exporta relatório em Excel
 */
export async function exportFinancialAccountMovementToExcel(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { 
      startDate, 
      endDate, 
      financialAccountIds, 
      groupBy = 'day',
      data 
    } = req.body;

    // Validações básicas
    if (!startDate || !endDate || !financialAccountIds || !data) {
      return res.status(400).json({ 
        error: 'Dados insuficientes para gerar Excel' 
      });
    }

    const excelBuffer = await FinancialAccountMovementReportService.generateExcel({
      companyId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      financialAccountIds,
      groupBy,
      data
    });

    const filename = `relatorio-movimentacao-contas-${startDate}-${endDate}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);

    logger.info('Financial account movement Excel exported', {
      companyId,
      startDate,
      endDate,
      filename,
      size: excelBuffer.length
    });

    return res.send(excelBuffer);

  } catch (error: any) {
    logger.error('Error exporting financial account movement to Excel', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: 'Erro ao gerar Excel do relatório'
    });
  }
}