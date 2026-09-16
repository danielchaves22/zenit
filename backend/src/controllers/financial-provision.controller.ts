import { Request, Response } from 'express';
import FinancialProvisionService, {
  FinancialProvisionValidationError
} from '../services/financial-provision.service';
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

function provisionErrorResponse(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof FinancialProvisionValidationError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.issues
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return res.status(400).json({ error: message || fallbackMessage });
}

export async function listFinancialProvisions(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const provisions = await FinancialProvisionService.list(companyId, new Date());
    return res.status(200).json({
      ...provisions,
      access: getWorkspacePlanningCapabilities({
        role: req.user.role,
        isCompanyOwner: req.user.isCompanyOwner
      })
    });
  } catch (error: unknown) {
    return provisionErrorResponse(res, error, 'Erro ao carregar provisões');
  }
}

export async function createFinancialProvision(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const at = new Date();
    const provision = await FinancialProvisionService.create({
      ...context,
      input: req.body as CreateFinancialProvisionBody,
      at
    });
    return res.status(201).json(provision);
  } catch (error: unknown) {
    return provisionErrorResponse(res, error, 'Erro ao criar provisão');
  }
}

export async function updateFinancialProvision(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const at = new Date();
    const provision = await FinancialProvisionService.update({
      id: getProvisionId(req),
      companyId,
      input: req.body as UpdateFinancialProvisionBody,
      at
    });
    return res.status(200).json(provision);
  } catch (error: unknown) {
    return provisionErrorResponse(res, error, 'Erro ao alterar provisão');
  }
}

export async function addFinancialProvisionEntry(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const input = req.body as CreateFinancialProvisionEntryBody;
    const at = new Date();
    const provision = await FinancialProvisionService.addEntry({
      id: getProvisionId(req),
      ...context,
      ...input,
      at
    });
    return res.status(201).json(provision);
  } catch (error: unknown) {
    return provisionErrorResponse(
      res,
      error,
      'Erro ao registrar movimentação da provisão'
    );
  }
}

export async function useFinancialProvision(req: Request, res: Response) {
  try {
    const context = getUserContext(req);
    const input = req.body as UseFinancialProvisionBody;
    const at = new Date();
    const provision = await FinancialProvisionService.use({
      id: getProvisionId(req),
      ...context,
      ...input,
      at
    });
    return res.status(200).json(provision);
  } catch (error: unknown) {
    return provisionErrorResponse(res, error, 'Erro ao registrar utilização da provisão');
  }
}

export async function cancelFinancialProvision(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const at = new Date();
    const provision = await FinancialProvisionService.cancel({
      id: getProvisionId(req),
      companyId,
      at
    });
    return res.status(200).json(provision);
  } catch (error: unknown) {
    return provisionErrorResponse(res, error, 'Erro ao cancelar provisão');
  }
}
