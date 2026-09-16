import { Request, Response } from 'express';
import FinancialProvisionService from '../services/financial-provision.service';
import { getWorkspacePlanningCapabilities } from '../policies/workspace-planning-access.policy';
import {
  CreateFinancialProvisionBody,
  CreateFinancialProvisionEntryBody,
  UpdateFinancialProvisionBody,
  UseFinancialProvisionBody
} from '../validators/financial-provision.validator';

function getUserContext(req: Request): { companyId: number; userId: number } {
  const { companyId, userId } = req.user;

  if (!companyId || !userId) {
    throw new Error('Contexto do usuário não encontrado');
  }

  return { companyId, userId };
}

function getProvisionId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Provisão inválida');
  }
  return id;
}

export async function listFinancialProvisions(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const provisions = await FinancialProvisionService.list(companyId);
    return res.status(200).json({
      ...provisions,
      access: getWorkspacePlanningCapabilities({
        role: req.user.role,
        isCompanyOwner: req.user.isCompanyOwner
      })
    });
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao carregar provisões'
    });
  }
}

export async function createFinancialProvision(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const provision = await FinancialProvisionService.create({
      ...context,
      input: req.body as CreateFinancialProvisionBody
    });
    return res.status(201).json(provision);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao criar provisão'
    });
  }
}

export async function updateFinancialProvision(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const provision = await FinancialProvisionService.update({
      id: getProvisionId(req),
      companyId,
      input: req.body as UpdateFinancialProvisionBody
    });
    return res.status(200).json(provision);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao alterar provisão'
    });
  }
}

export async function addFinancialProvisionEntry(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const input = req.body as CreateFinancialProvisionEntryBody;
    const provision = await FinancialProvisionService.addEntry({
      id: getProvisionId(req),
      ...context,
      ...input
    });
    return res.status(201).json(provision);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao registrar movimentação da provisão'
    });
  }
}

export async function useFinancialProvision(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const input = req.body as UseFinancialProvisionBody;
    const provision = await FinancialProvisionService.use({
      id: getProvisionId(req),
      ...context,
      ...input
    });
    return res.status(200).json(provision);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao registrar utilização da provisão'
    });
  }
}

export async function cancelFinancialProvision(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const provision = await FinancialProvisionService.cancel({
      id: getProvisionId(req),
      companyId
    });
    return res.status(200).json(provision);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao cancelar provisão'
    });
  }
}
