import { Request, Response } from 'express';
import PersonalFinancialProfileService from '../services/personal-financial-profile.service';
import { SavePersonalFinancialProfileBody } from '../validators/personal-financial-profile.validator';
import { getWorkspacePlanningCapabilities } from '../policies/workspace-planning-access.policy';

function authenticatedUserId(req: Request): number {
  const userId = req.user?.userId;
  if (!userId) throw new Error('Usuário autenticado não encontrado');
  return userId;
}

function authenticatedCompanyId(req: Request): number {
  const companyId = req.user?.companyId;
  if (!companyId) throw new Error('Workspace financeiro não encontrado');
  return companyId;
}

function responseWithAccess(req: Request, result: unknown) {
  return {
    ...(result as Record<string, unknown>),
    access: getWorkspacePlanningCapabilities({
      role: req.user.role,
      isCompanyOwner: req.user.isCompanyOwner
    })
  };
}

export async function getPersonalFinancialProfile(req: Request, res: Response) {
  try {
    const result = await PersonalFinancialProfileService.get(
      authenticatedUserId(req),
      authenticatedCompanyId(req)
    );
    return res.status(200).json(responseWithAccess(req, result));
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao carregar perfil de planejamento financeiro'
    });
  }
}

export async function savePersonalFinancialProfile(req: Request, res: Response) {
  try {
    const result = await PersonalFinancialProfileService.save(
      authenticatedUserId(req),
      authenticatedCompanyId(req),
      req.body as SavePersonalFinancialProfileBody
    );
    return res.status(200).json(responseWithAccess(req, result));
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao salvar perfil de planejamento financeiro'
    });
  }
}
