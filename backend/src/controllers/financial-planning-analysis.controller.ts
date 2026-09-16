import { Request, Response } from 'express';
import FinancialPlanningAnalysisService, {
  FinancialPlanningAnalysisError
} from '../services/financial-planning-analysis.service';
import {
  ConfirmFinancialPlanningAnalysisBody,
  PreviewFinancialPlanningAnalysisQuery
} from '../validators/financial-planning-analysis.validator';

function getUserContext(req: Request): { companyId: number; userId: number } {
  const { companyId, userId } = req.user;
  if (!companyId || !userId) throw new Error('Contexto do usuário não encontrado');
  return { companyId, userId };
}

function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof FinancialPlanningAnalysisError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  return res.status(400).json({ error: error.message || fallback });
}

export async function previewFinancialPlanningAnalysis(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const query = req.query as unknown as PreviewFinancialPlanningAnalysisQuery;
    return res.status(200).json(
      await FinancialPlanningAnalysisService.preview({
        ...context,
        historyMonths: query.historyMonths
      })
    );
  } catch (error: any) {
    return sendError(res, error, 'Erro ao preparar diagnóstico financeiro');
  }
}

export async function confirmFinancialPlanningAnalysis(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const input = req.body as ConfirmFinancialPlanningAnalysisBody;
    const result = await FinancialPlanningAnalysisService.confirm({
      ...context,
      historyMonths: input.historyMonths,
      targetMonthlySavings: input.targetMonthlySavings,
      selectedSourceKeys: input.selectedSourceKeys,
      basisHash: input.basisHash
    });
    return res.status(result.created ? 201 : 200).json(result.snapshot);
  } catch (error: any) {
    return sendError(res, error, 'Erro ao confirmar diagnóstico financeiro');
  }
}
