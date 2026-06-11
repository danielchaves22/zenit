import { Request, Response } from 'express';
import UserVariableProjectionPreferenceService from '../services/user-variable-projection-preference.service';

function getUserPreferenceContext(req: Request): { userId: number; companyId: number } {
  // @ts-ignore - preenchido pelos middlewares de auth/tenant
  const { userId, companyId } = req.user;

  if (!userId || !companyId) {
    throw new Error('Contexto do usuario ou empresa nao encontrado');
  }

  return { userId, companyId };
}

export async function getVariableProjectionPreference(req: Request, res: Response) {
  try {
    const { userId, companyId } = getUserPreferenceContext(req);
    const preference = await UserVariableProjectionPreferenceService.getPreference(userId, companyId);
    return res.status(200).json(preference);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao carregar preferencias de projecao variavel'
    });
  }
}

export async function updateVariableProjectionPreference(req: Request, res: Response) {
  try {
    const { userId, companyId } = getUserPreferenceContext(req);
    const preference = await UserVariableProjectionPreferenceService.setPreference({
      userId,
      companyId,
      trackedExpenseCategoryIds: req.body.trackedExpenseCategoryIds || []
    });

    return res.status(200).json(preference);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao salvar preferencias de projecao variavel'
    });
  }
}
