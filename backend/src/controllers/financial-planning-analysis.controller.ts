import { Request, Response } from 'express';
import FinancialPlanningAnalysisService, {
  FinancialPlanningAnalysisError
} from '../services/financial-planning-analysis.service';
import FinancialPlanningGuidanceService from '../services/financial-planning-guidance.service';
import {
  ConfirmFinancialPlanningAnalysisBody,
  GetFinancialPlanningSnapshotParams,
  ListFinancialPlanningGuidanceQuery,
  ListFinancialPlanningSnapshotsQuery,
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
    const at = new Date();
    return res.status(200).json(
      await FinancialPlanningAnalysisService.preview({
        ...context,
        historyMonths: query.historyMonths,
        at
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
    const at = new Date();
    const result = await FinancialPlanningAnalysisService.confirm({
      ...context,
      historyMonths: input.historyMonths,
      targetMonthlySavings: input.targetMonthlySavings,
      selectedSourceKeys: input.selectedSourceKeys,
      basisHash: input.basisHash,
      at
    });
    return res.status(result.created ? 201 : 200).json(result.snapshot);
  } catch (error: any) {
    return sendError(res, error, 'Erro ao confirmar diagnóstico financeiro');
  }
}

export async function listFinancialPlanningSnapshots(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const query = req.query as unknown as ListFinancialPlanningSnapshotsQuery;
    return res.status(200).json(
      await FinancialPlanningAnalysisService.listSnapshots({
        ...context,
        cursor: query.cursor,
        limit: query.limit
      })
    );
  } catch (error: any) {
    return sendError(res, error, 'Erro ao consultar histórico de diagnósticos financeiros');
  }
}

export async function getFinancialPlanningSnapshot(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const params = req.params as unknown as GetFinancialPlanningSnapshotParams;
    return res.status(200).json(
      await FinancialPlanningAnalysisService.getSnapshot({
        ...context,
        snapshotId: params.id
      })
    );
  } catch (error: any) {
    return sendError(res, error, 'Erro ao consultar diagnóstico financeiro');
  }
}

export async function getFinancialPlanningSnapshotScenarios(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const params = req.params as unknown as GetFinancialPlanningSnapshotParams;
    return res.status(200).json(
      await FinancialPlanningAnalysisService.getScenarios({
        ...context,
        snapshotId: params.id
      })
    );
  } catch (error: any) {
    return sendError(res, error, 'Erro ao calcular cenários para o retrato financeiro');
  }
}

export async function generateFinancialPlanningGuidance(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const params = req.params as unknown as GetFinancialPlanningSnapshotParams;
    return res.status(200).json(
      await FinancialPlanningGuidanceService.generate({
        ...context,
        snapshotId: params.id
      })
    );
  } catch (error: any) {
    return sendError(res, error, 'Erro ao gerar parecer explicativo para o retrato financeiro');
  }
}

export async function listFinancialPlanningGuidance(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const params = req.params as unknown as GetFinancialPlanningSnapshotParams;
    const query = req.query as unknown as ListFinancialPlanningGuidanceQuery;
    return res.status(200).json(
      await FinancialPlanningGuidanceService.list({
        ...context,
        snapshotId: params.id,
        cursor: query.cursor,
        limit: query.limit
      })
    );
  } catch (error: any) {
    return sendError(res, error, 'Erro ao consultar pareceres do retrato financeiro');
  }
}
